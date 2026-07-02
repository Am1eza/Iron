/** Market values + history (نبض بازار). */
import { and, asc, eq, gte } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { marketValues, marketPoints } from '@/lib/server/db/schema';
import type { MarketKey, MarketValue } from '@/lib/types/domain';

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

/** Upsert a value: computes movement vs the stored one, appends history. */
export async function upsertMarketValue(input: {
  key: MarketKey;
  value: number;
  label?: string;
  unit?: string;
  source: 'tgju' | 'admin';
}): Promise<MarketValue> {
  const db = getDb();
  const prev = await getMarketValue(input.key);
  let movementPct: number | null = null;
  let movementDir: 'up' | 'down' | 'flat' = 'flat';
  if (prev && prev.value > 0) {
    movementPct = Math.round(((input.value - prev.value) / prev.value) * 10000) / 100;
    movementDir = movementPct > 0.005 ? 'up' : movementPct < -0.005 ? 'down' : 'flat';
  }
  const now = new Date();
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
  return toDto({ ...row, movementPct: row.movementPct } as Row);
}

/** Flag all tgju-sourced rows stale (outage) — last-known values keep serving. */
export async function flagTgjuStale(): Promise<void> {
  await getDb().update(marketValues).set({ isStale: true }).where(eq(marketValues.source, 'tgju'));
}

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export async function marketHistory(key: MarketKey, range = '30d') {
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(marketPoints)
    .where(and(eq(marketPoints.key, key), gte(marketPoints.at, since)))
    .orderBy(asc(marketPoints.at));
  return rows.map((p) => ({ id: p.id, key: p.key, value: p.value, at: p.at.toISOString() }));
}
