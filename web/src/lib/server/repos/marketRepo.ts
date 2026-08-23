/** Market values + history (نبض بازار). */
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { cacheDel } from '@/lib/server/redis';
import { marketValues, marketPoints } from '@/lib/server/db/schema';
import type { MarketKey, MarketValue } from '@/lib/types/domain';

/** Read-through cache key for the public ticker (GET /api/market). Owned here,
 *  next to the writers, so every mutation invalidates it — an admin override or
 *  tgju poll is reflected on the next request instead of after ≤30s of stale TTL. */
export const MARKET_CACHE_KEY = 'market:values';

/** Movement is a day-over-day comparison, not tick-to-tick — the poll job
 *  runs every 60s (see jobs/marketPoll.job.ts) and usd/eur/gold18 routinely
 *  sit unchanged for many consecutive polls, so comparing against the
 *  immediately-prior stored value made the ticker read 0.00% almost always
 *  for those three, even on days tgju itself shows a real multi-percent
 *  move. ounce/billet only ever looked "correct" by coincidence (ounce
 *  ticks more often; billet was, at the time, stale from an admin edit weeks
 *  ago — it is now polled every 15 min, see jobs/billetPoll.job.ts). */
const MOVEMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

type Row = typeof marketValues.$inferSelect;

function toDto(r: Row): MarketValue {
  return {
    key: r.key,
    label: r.label,
    value: r.value,
    unit: r.unit,
    source: r.source,
    movementDir: r.movementDir,
    movementPct: r.movementPct ?? undefined,
    updatedAt: r.updatedAt.toISOString(),
    isStale: r.isStale,
  };
}

export async function listMarketValues(): Promise<MarketValue[]> {
  const rows = await getDb().select().from(marketValues);
  const order: MarketKey[] = ['usd', 'eur', 'gold18', 'ounce', 'billet'];
  return rows.map(toDto).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export async function getMarketValue(key: MarketKey) {
  const rows = await getDb().select().from(marketValues).where(eq(marketValues.key, key)).limit(1);
  return rows[0] ?? null;
}

/** The value in effect ~24h ago: the most recent history point at or before
 *  that instant. marketPoints only inserts on an actual change (see below),
 *  so this correctly reflects "whatever it last changed to before the
 *  window" rather than requiring a point to exist exactly on the boundary.
 *  Falls back to the OLDEST known point when all history is younger than
 *  24h (a key that started being tracked recently) so a real, if partial,
 *  movement still shows instead of silently going flat. */
async function referenceValue(key: MarketKey, since: Date): Promise<number | null> {
  const db = getDb();
  const before = await db
    .select({ value: marketPoints.value })
    .from(marketPoints)
    .where(and(eq(marketPoints.key, key), lte(marketPoints.at, since)))
    .orderBy(desc(marketPoints.at))
    .limit(1);
  if (before[0]) return before[0].value;

  const earliest = await db
    .select({ value: marketPoints.value })
    .from(marketPoints)
    .where(eq(marketPoints.key, key))
    .orderBy(asc(marketPoints.at))
    .limit(1);
  return earliest[0]?.value ?? null;
}

/** Upsert a value: computes movement vs ~24h ago, appends history. */
export async function upsertMarketValue(input: {
  key: MarketKey;
  value: number;
  label?: string;
  unit?: string;
  source: MarketValue['source'];
}): Promise<MarketValue> {
  const db = getDb();
  const prev = await getMarketValue(input.key);
  const now = new Date();

  const ref = await referenceValue(input.key, new Date(now.getTime() - MOVEMENT_WINDOW_MS));
  let movementPct: number | null = null;
  let movementDir: 'up' | 'down' | 'flat' = 'flat';
  if (ref && ref > 0) {
    movementPct = Math.round(((input.value - ref) / ref) * 10000) / 100;
    movementDir = movementPct > 0.005 ? 'up' : movementPct < -0.005 ? 'down' : 'flat';
  }

  const row = {
    key: input.key,
    label: input.label ?? prev?.label ?? input.key,
    value: input.value,
    unit: input.unit ?? prev?.unit ?? 'تومان',
    source: input.source,
    movementDir,
    movementPct,
    updatedAt: now,
    isStale: false,
  };
  await db
    .insert(marketValues)
    .values(row)
    .onConflictDoUpdate({ target: marketValues.key, set: row });
  // History: skip no-change points to keep the series meaningful.
  if (!prev || prev.value !== input.value) {
    await db.insert(marketPoints).values({ id: ulid(), key: input.key, value: input.value, at: now });
  }
  // Invalidate the ticker read-through cache so the new value is visible on the
  // next GET instead of trailing the ≤30s TTL. Best-effort (no-op without Redis).
  await cacheDel(MARKET_CACHE_KEY);
  return toDto({ ...row, movementPct: row.movementPct } as Row);
}

/** Flag every row last written by `source` stale (that feed is down) —
 *  last-known values keep serving with the outage badge (AC-A-2). Scoped by
 *  source so a tgju outage never badges the esfahanahan-fed billet row (or a
 *  hand-entered `admin` override) stale, and vice versa. */
export async function flagSourceStale(source: MarketValue['source']): Promise<void> {
  await getDb().update(marketValues).set({ isStale: true }).where(eq(marketValues.source, source));
  // The served payload's isStale flips — drop the cache so the outage shows promptly.
  await cacheDel(MARKET_CACHE_KEY);
}

/** Flag all tgju-sourced rows stale (outage) — last-known values keep serving. */
export async function flagTgjuStale(): Promise<void> {
  await flagSourceStale('tgju');
}

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/** Tehran-local calendar-day key (YYYY-MM-DD Gregorian, just used for
 *  grouping — not a Jalali conversion) so a point taken at 23:50 and one at
 *  00:10 local time never land in the same bucket just because they're both
 *  "today" in UTC. */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayKey = (d: Date) => dayKeyFormatter.format(d);

/** PriceChart (the only consumer) treats every returned point as exactly one
 * calendar day — it walks backwards from "today" one day per array index to
 * label the data table, and spaces the x-axis assuming uniform daily steps.
 * The poll job stores a raw row every ~60s (more often for ounce), so without
 * this aggregation a "week" of raw rows could be a single afternoon and the
 * data-table dates were flatly wrong. Collapse to one point per Tehran-local
 * day (the last value recorded that day, i.e. a daily close) so the contract
 * PriceChart already assumes actually holds. */
export async function marketHistory(key: MarketKey, range = '30d') {
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(marketPoints)
    .where(and(eq(marketPoints.key, key), gte(marketPoints.at, since)))
    .orderBy(asc(marketPoints.at));

  const byDay = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    byDay.set(dayKey(row.at), row); // later rows in the (ascending) order win → last value of the day
  }
  return [...byDay.values()]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((p) => ({ id: p.id, key: p.key, value: p.value, at: p.at.toISOString() }));
}
