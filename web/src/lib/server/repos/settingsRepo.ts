/**
 * Settings — admin-configurable business rules (VAT, holidays, logistics,
 * club tiers). Cached in-process for 60s; admin PUT busts the cache.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { settings } from '@/lib/server/db/schema';

const cache = new Map<string, { value: unknown; at: number }>();
const TTL_MS = 60_000;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const rows = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
  const value = rows[0] ? (rows[0].value as T) : fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache.set(key, { value, at: Date.now() });
}

export async function listSettings() {
  return getDb().select().from(settings);
}

export function bustSettingsCache(): void {
  cache.clear();
}

/** Frequently-used composite reads. */
export async function getHolidays(): Promise<Set<string>> {
  const arr = await getSetting<string[]>('HOLIDAYS', []);
  return new Set(arr);
}
export function getVatRate(): Promise<number> {
  return getSetting<number>('VAT_RATE', 0.1);
}
export function getStaleHideAfterDays(): Promise<number> {
  return getSetting<number>('PRICE_STALE_HIDE_AFTER_DAYS', 2);
}

/**
 * Automated price mirroring (US-02.5). One jsonb blob rather than six scalar
 * keys because these values are only ever read together, by one job.
 *
 * `enabled` is a kill switch, not an approval gate — it exists so the owner
 * can stop the twice-daily run from the panel in the middle of a bad day
 * without waiting on a deploy or editing the host's crontab.
 */
export const PRICE_SYNC_SETTING_KEY = 'PRICE_SYNC';

export interface PriceSyncConfig {
  enabled: boolean;
  /** Category slugs in scope. Empty = every mapped sub-category. */
  categorySlugs: string[];
  /** Plausibility band for a per-kg steel price, Toman (see priceSync.match). */
  minPriceToman: number;
  maxPriceToman: number;
  maxCandidateSpreadPct: number;
  maxSourceAgeDays: number;
}

export const PRICE_SYNC_DEFAULTS: PriceSyncConfig = {
  enabled: true,
  categorySlugs: [],
  minPriceToman: 10_000,
  maxPriceToman: 500_000,
  maxCandidateSpreadPct: 8,
  maxSourceAgeDays: 10,
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Merged over the defaults so a partially-written setting row (or one saved
 *  before a field existed) can never leave the job with an undefined bound. */
export async function getPriceSyncConfig(): Promise<PriceSyncConfig> {
  const raw = await getSetting<Partial<PriceSyncConfig>>(PRICE_SYNC_SETTING_KEY, {});
  const stored = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : PRICE_SYNC_DEFAULTS.enabled,
    categorySlugs: Array.isArray(stored.categorySlugs)
      ? stored.categorySlugs.filter((s): s is string => typeof s === 'string')
      : PRICE_SYNC_DEFAULTS.categorySlugs,
    minPriceToman: isNum(stored.minPriceToman) ? stored.minPriceToman : PRICE_SYNC_DEFAULTS.minPriceToman,
    maxPriceToman: isNum(stored.maxPriceToman) ? stored.maxPriceToman : PRICE_SYNC_DEFAULTS.maxPriceToman,
    maxCandidateSpreadPct: isNum(stored.maxCandidateSpreadPct)
      ? stored.maxCandidateSpreadPct
      : PRICE_SYNC_DEFAULTS.maxCandidateSpreadPct,
    maxSourceAgeDays: isNum(stored.maxSourceAgeDays)
      ? stored.maxSourceAgeDays
      : PRICE_SYNC_DEFAULTS.maxSourceAgeDays,
  };
}
