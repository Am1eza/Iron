// @vitest-environment node
/**
 * Regression coverage for the 2026-08-14 fix: movementPct/movementDir used to
 * compare against whatever the immediately-previous poll (≤60s earlier)
 * stored, which made usd/eur/gold18 read 0.00% almost permanently — rial
 * values rarely move between two 60s polls even on a day tgju itself shows a
 * real multi-percent swing. The fix compares against the value in effect
 * ~24h ago instead, using existing marketPoints history.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { marketPoints } from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { upsertMarketValue } from './marketRepo';

let db: Db;
let close: () => Promise<void>;

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 60_000);
afterAll(async () => {
  await close();
});

describe('upsertMarketValue — movement is day-over-day, not tick-to-tick', () => {
  it('uses the value from ~24h ago even when several closer polls happened in between', async () => {
    const now = Date.now();
    await db.insert(marketPoints).values([
      { id: 'p1', key: 'usd', value: 1000, at: new Date(now - 25 * HOUR) },
      { id: 'p2', key: 'usd', value: 1020, at: new Date(now - 2 * HOUR) },
      { id: 'p3', key: 'usd', value: 1040, at: new Date(now - 1 * HOUR) },
    ]);

    // Old (buggy) behaviour would compare against the last poll (1040),
    // giving ~0.48%. Day-over-day against the ~25h-old point (1000) gives 4.5%.
    const result = await upsertMarketValue({ key: 'usd', value: 1045, source: 'tgju' });

    expect(result.movementPct).toBeCloseTo(4.5, 2);
    expect(result.movementDir).toBe('up');
  });

  it('a value unchanged for many consecutive 60s polls still reports the real daily move', async () => {
    const now = Date.now();
    await db.insert(marketPoints).values([{ id: 'p4', key: 'eur', value: 2000, at: new Date(now - 26 * HOUR) }]);

    // Simulate the poll job hitting the SAME value repeatedly (no history point
    // is inserted for a no-op poll — matches upsertMarketValue's own skip rule).
    let result = await upsertMarketValue({ key: 'eur', value: 2100, source: 'tgju' });
    result = await upsertMarketValue({ key: 'eur', value: 2100, source: 'tgju' });
    result = await upsertMarketValue({ key: 'eur', value: 2100, source: 'tgju' });

    expect(result.movementPct).toBeCloseTo(5, 2);
    expect(result.movementDir).toBe('up');
  });

  it('falls back to the oldest known point when all history is younger than 24h', async () => {
    const now = Date.now();
    await db.insert(marketPoints).values([{ id: 'p5', key: 'gold18', value: 500, at: new Date(now - 10 * HOUR) }]);

    const result = await upsertMarketValue({ key: 'gold18', value: 510, source: 'tgju' });

    expect(result.movementPct).toBeCloseTo(2, 2);
    expect(result.movementDir).toBe('up');
  });

  it('no history at all yields a flat movement, same as before', async () => {
    const result = await upsertMarketValue({ key: 'billet', value: 285000, source: 'admin' });
    expect(result.movementPct).toBeUndefined();
    expect(result.movementDir).toBe('flat');
  });
});
