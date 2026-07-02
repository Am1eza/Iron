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
