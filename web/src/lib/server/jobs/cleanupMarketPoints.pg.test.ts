// @vitest-environment node
/**
 * ⚠️ THIS COVERS A STATEMENT THAT DELETES DATA.
 *
 * `thinMarketPoints` replaced an unbounded `NOT IN` sweep with a bounded
 * anti-join driven by a persisted watermark. The retention RULE is meant to be
 * byte-identical; only the query shape changed. A wrong rewrite here silently
 * destroys ticker history, and nothing downstream would report it — the chart
 * would just quietly have fewer points.
 *
 * So these tests do not assert a hand-written expectation of what "should"
 * survive. They run the ORIGINAL statement (reproduced verbatim below) and the
 * new implementation against IDENTICAL fixtures and assert the surviving row
 * sets are equal — including across the incremental case the bounding
 * introduces, which is the only place the two could actually diverge.
 */
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import { marketPoints } from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { bustSettingsCache } from '@/lib/server/repos/settingsRepo';
import { thinMarketPoints } from './cleanup.job';

let db: Db;
let close: () => Promise<void>;

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The statement exactly as it stood before this change — the oracle. */
async function originalThin() {
  await db.execute(sql`
    DELETE FROM market_points mp
    WHERE mp.at < now() - interval '48 hours'
      AND mp.id NOT IN (
        SELECT DISTINCT ON (key, date_trunc('hour', at), floor(extract(minute FROM at) / 15)) id
        FROM market_points
        WHERE at < now() - interval '48 hours'
        ORDER BY key, date_trunc('hour', at), floor(extract(minute FROM at) / 15), at DESC
      )
  `);
}

/**
 * A spread of ticker history: several keys, several quarter-hour buckets,
 * multiple points per bucket, some straddling the 48h cutoff, and one bucket
 * that the cutoff cuts through (the case the bounding has to get right).
 */
function fixture() {
  const now = Date.now();
  const rows: Array<{ id: string; key: 'usd' | 'gold18' | 'billet'; value: number; at: Date }> = [];
  let n = 0;
  const add = (key: 'usd' | 'gold18' | 'billet', agoMs: number) => {
    n++;
    rows.push({ id: ulid(), key, value: 1000 + n, at: new Date(now - agoMs) });
  };
  for (const key of ['usd', 'gold18', 'billet'] as const) {
    // Well past the cutoff — dense, several points inside single buckets.
    for (const h of [50, 51, 60, 72, 96, 120]) {
      add(key, h * HOUR);
      add(key, h * HOUR + 1 * MIN);
      add(key, h * HOUR + 2 * MIN);
      add(key, h * HOUR + 14 * MIN); // same quarter-hour as the three above
      add(key, h * HOUR + 16 * MIN); // the NEXT quarter-hour
    }
    // Straddling the cutoff: same bucket, one side each.
    add(key, 48 * HOUR + 2 * MIN);
    add(key, 48 * HOUR + 5 * MIN);
    add(key, 48 * HOUR - 2 * MIN);
    // Inside the 48h full-resolution window — must never be touched.
    for (const m of [10, 11, 12, 600, 601]) add(key, m * MIN);
  }
  return rows;
}

async function reset(rows: ReturnType<typeof fixture>) {
  await db.execute(sql`DELETE FROM market_points`);
  await db.execute(sql`DELETE FROM settings`);
  bustSettingsCache();
  await db.insert(marketPoints).values(rows);
}

/**
 * Simulate one hour passing. `now()` is not movable, so shift the data back
 * instead — BOTH the points and the stored watermark, which are absolute
 * timestamps in the same frame. Shifting only the rows would model a scenario
 * that cannot occur (history sliding backwards underneath a fixed watermark)
 * and would make the bounded run skip work it is entitled to skip.
 */
async function advanceClockByAnHour() {
  await db.execute(sql`UPDATE market_points SET at = at - interval '1 hour'`);
  await db.execute(sql`
    UPDATE settings
    SET value = to_jsonb(to_char(((value #>> '{}')::timestamptz - interval '1 hour')
                                 AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    WHERE key = 'MARKET_POINTS_THIN_WATERMARK'
  `);
  bustSettingsCache();
}

async function survivors(): Promise<string[]> {
  const res = (await db.execute(sql`SELECT id FROM market_points ORDER BY id`)) as unknown as
    | { rows?: Array<{ id: string }> }
    | Array<{ id: string }>;
  const list = Array.isArray(res) ? res : (res.rows ?? []);
  return list.map((r) => String(r.id));
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

beforeEach(() => {
  bustSettingsCache();
});

describe('thinMarketPoints — deletion set is identical to the original NOT IN sweep', () => {
  it('cold start (no watermark) deletes exactly what the old statement deleted', async () => {
    const rows = fixture();

    await reset(rows);
    await originalThin();
    const expected = await survivors();

    await reset(rows);
    await thinMarketPoints();
    const actual = await survivors();

    expect(actual).toEqual(expected);
    // Sanity: the fixture must actually exercise the delete, or the assertion
    // above would pass on a statement that does nothing at all.
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBeLessThan(rows.length);
  });

  it('is idempotent — a second pass over already-thinned history deletes nothing', async () => {
    await reset(fixture());
    await thinMarketPoints();
    const afterFirst = await survivors();
    await thinMarketPoints();
    expect(await survivors()).toEqual(afterFirst);
  });

  it('the BOUNDED second pass still matches an unbounded sweep of the same data', async () => {
    // The case the watermark introduces and the only one where the two could
    // diverge: run once, let more history age past the cutoff, run again. The
    // bounded run must reach the newly-eligible buckets — including the bucket
    // the previous cutoff cut through, which is why the lower bound is
    // `watermark − 15min` and not `watermark`.
    const rows = fixture();

    await reset(rows);
    await thinMarketPoints(); // establishes the watermark
    const midway = new Set(await survivors());

    // Advance the clock by an hour so a fresh slice crosses the 48h boundary,
    // exactly as the next hourly tick would see it. `now()` cannot be moved, so
    // shift everything ELSE back instead — both the rows AND the watermark,
    // since they are absolute timestamps in the same frame and shifting only
    // one would be a different scenario (and not one that can occur).
    await advanceClockByAnHour();
    await thinMarketPoints(); // BOUNDED run — this is what is under test
    const actual = await survivors();

    // Oracle: the SAME intermediate state, aged the same way, swept with the
    // unbounded statement.
    await db.execute(sql`DELETE FROM market_points`);
    await db.insert(marketPoints).values(rows.filter((r) => midway.has(r.id)));
    await db.execute(sql`UPDATE market_points SET at = at - interval '1 hour'`);
    await originalThin(); // unbounded: ignores the watermark entirely
    const expected = await survivors();

    expect(actual).toEqual(expected);
    // The second pass must actually have had work to do, or this proves nothing.
    expect(actual.length).toBeLessThan(midway.size);
  });

  it('a lost/absent watermark falls back to the full unbounded sweep', async () => {
    const rows = fixture();
    await reset(rows);
    await thinMarketPoints();
    const thinned = await survivors();

    // Simulate the watermark row being lost (restore, manual delete) while the
    // table still holds un-thinned history: the next run must sweep everything
    // rather than skip it.
    await db.execute(sql`DELETE FROM market_points`);
    await db.execute(sql`DELETE FROM settings`);
    bustSettingsCache();
    await db.insert(marketPoints).values(rows);
    await thinMarketPoints();

    expect(await survivors()).toEqual(thinned);
  });

  it('never touches anything inside the 48h full-resolution window', async () => {
    const rows = fixture();
    const recent = rows.filter((r) => Date.now() - r.at.getTime() < 48 * HOUR).map((r) => r.id);
    expect(recent.length).toBeGreaterThan(0);

    await reset(rows);
    await thinMarketPoints();
    const left = new Set(await survivors());
    for (const id of recent) expect(left.has(id)).toBe(true);
  });

  it('leaves at most one point per key per quarter-hour past the cutoff', async () => {
    await reset(fixture());
    await thinMarketPoints();
    const res = (await db.execute(sql`
      SELECT count(*)::int AS n
      FROM market_points
      WHERE at < now() - interval '48 hours'
      GROUP BY key, date_trunc('hour', at), floor(extract(minute FROM at) / 15)
      HAVING count(*) > 1
    `)) as unknown as { rows?: unknown[] } | unknown[];
    const over = Array.isArray(res) ? res : (res.rows ?? []);
    expect(over).toHaveLength(0);
  });
});
