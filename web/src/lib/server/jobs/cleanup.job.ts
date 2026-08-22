/**
 * Hourly upkeep — purge expired OTPs / refresh tokens / stale rate rows and
 * thin market history so the ticker table never grows unbounded.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { cleanupExpiredAuth } from '@/lib/auth/store';
import { idempotencyKeys } from '@/lib/server/db/schema';
import { getSetting, setSetting } from '@/lib/server/repos/settingsRepo';
import type { Job } from './scheduler';

/** How long full-resolution ticker history is kept before thinning. */
const MARKET_POINTS_FULL_RES = sql`interval '48 hours'`;
/** One retained point per key per quarter-hour, once past the window above.
 *  Written with `sql.raw` because a bucket width is part of the GROUPING
 *  EXPRESSION, and a bound parameter there leaves Postgres unable to infer the
 *  operand type. It is a module constant — nothing caller- or user-supplied
 *  reaches it. */
const BUCKET = sql.raw('15');
/** Re-examine one bucket's worth of rows below the watermark — see the
 *  equivalence argument (a) in `thinMarketPoints`. */
const BUCKET_BACKSTOP = sql.raw("interval '15 minutes'");
/**
 * Timestamp (ISO) up to which market_points has already been thinned.
 * Only ever advanced after a successful pass — see `thinMarketPoints`.
 */
const THIN_WATERMARK_KEY = 'MARKET_POINTS_THIN_WATERMARK';

/**
 * Thin `market_points` to one row per (key, quarter-hour) once past 48h.
 *
 * ⚠️ THIS DELETES TICKER HISTORY. The retention RULE is unchanged; only the
 * query shape is. Two things were wrong with the previous statement:
 *
 *   DELETE FROM market_points mp
 *   WHERE mp.at < now() - interval '48 hours'
 *     AND mp.id NOT IN (SELECT DISTINCT ON (bucket) id FROM market_points
 *                       WHERE at < now() - interval '48 hours' ORDER BY …)
 *
 *   1. `NOT IN` over an unbounded subquery. Postgres either materialises the
 *      whole keep-set as a hashed subplan or, once it no longer fits work_mem,
 *      degrades to re-scanning it per candidate row — quadratic, on the one
 *      statement in this codebase that deletes data. It also scans the table
 *      TWICE (outer + subquery).
 *   2. It reconsidered ALL history older than 48h every single hour, even
 *      though every run but the first finds nothing there to do: those buckets
 *      were reduced to one row by the previous run and, because
 *      `upsertMarketValue` only ever inserts at `now()`, nothing can ever
 *      appear in them again.
 *
 * EQUIVALENCE (why the deletion set is identical):
 *
 *   Let T = the 48h cutoff for this run and w = the cutoff of the last
 *   successful run (the watermark). Deletion is BUCKET-LOCAL: whether a row is
 *   removed depends only on the other rows in its own (key, quarter-hour)
 *   bucket that are also older than T.
 *
 *   (a) Take any bucket B lying entirely below w. At the previous run every
 *       row of B satisfied `at < w`, so B was fully processed and left with
 *       exactly one row. `market_points` is insert-only at `at = now()`
 *       (marketRepo.upsertMarketValue — there is no backdating path), so no
 *       row can have entered B since. A one-row bucket yields no deletions.
 *       Hence restricting this run to `at >= w − 15min` — which covers every
 *       bucket not entirely below w — removes exactly the same rows as
 *       scanning all of history.
 *   (b) With no watermark (first run ever, or the row was lost) the lower
 *       bound is omitted and the statement is the unbounded one, i.e. the old
 *       behaviour exactly.
 *   (c) The watermark advances only after the DELETE succeeds. Missed runs,
 *       crashes, or a failed `setSetting` therefore make the NEXT window
 *       larger, never smaller — the job self-heals and can only ever
 *       re-examine rows, never skip them.
 *
 *   `NOT IN (DISTINCT ON … ORDER BY at DESC)` and `row_number() OVER (PARTITION
 *   BY … ORDER BY at DESC) > 1` select the same complement set: both keep the
 *   first row per bucket under an identical grouping and ordering. `id DESC` is
 *   appended purely as a tiebreaker for rows sharing an exact timestamp within
 *   one bucket — a case where the old statement's choice was UNSPECIFIED (and
 *   could differ between runs). The number of rows deleted is unchanged either
 *   way; only the identity of the survivor in an exact tie becomes defined.
 */
export async function thinMarketPoints(): Promise<void> {
  const db = getDb();

  // Read the cutoff off the DATABASE clock, not the app's, so the value stored
  // as the watermark is the same instant the DELETE compares against.
  const cutoffRes = (await db.execute(
    sql`SELECT (now() - ${MARKET_POINTS_FULL_RES})::timestamptz AS cutoff`,
  )) as unknown as { rows?: Array<{ cutoff: unknown }> } | Array<{ cutoff: unknown }>;
  const cutoffRow = (Array.isArray(cutoffRes) ? cutoffRes : (cutoffRes.rows ?? []))[0];
  const cutoff = new Date(String(cutoffRow?.cutoff));
  if (Number.isNaN(cutoff.getTime())) return; // never guess a cutoff for a DELETE

  const stored = await getSetting<string | null>(THIN_WATERMARK_KEY, null);
  const watermark = stored ? new Date(stored) : null;
  // A watermark that is missing, unparseable, or somehow ahead of the cutoff
  // (clock moved back, restored backup) falls back to the unbounded sweep —
  // the conservative direction: more work, never less data retained.
  const bounded = watermark && !Number.isNaN(watermark.getTime()) && watermark <= cutoff;
  const lowerBound = bounded
    ? sql` AND at >= ${watermark.toISOString()}::timestamptz - ${BUCKET_BACKSTOP}`
    : sql``;

  await db.execute(sql`
    DELETE FROM market_points mp
    USING (
      SELECT id FROM (
        SELECT id,
               row_number() OVER (
                 PARTITION BY key,
                              date_trunc('hour', at),
                              floor(extract(minute FROM at) / ${BUCKET})
                 ORDER BY at DESC, id DESC
               ) AS rn
        FROM market_points
        WHERE at < ${cutoff.toISOString()}::timestamptz${lowerBound}
      ) ranked
      WHERE ranked.rn > 1
    ) doomed
    WHERE mp.id = doomed.id
  `);

  // Only after the DELETE committed — see (c) above.
  await setSetting(THIN_WATERMARK_KEY, cutoff.toISOString());
}

export const cleanupJob: Job = {
  name: 'cleanup',
  everyMs: 60 * 60 * 1000,
  async run() {
    await cleanupExpiredAuth();
    const db = getDb();
    // A claimed idempotency key can be stuck at status:'pending' forever if
    // the Worker/process is evicted between the insert-claim and the
    // update/delete (withIdempotency's own try/catch only releases the claim
    // on a thrown error, not on an abrupt eviction) — purge anything stuck
    // well past any real request's duration so a retry isn't 409'd forever.
    await db
      .delete(idempotencyKeys)
      .where(sql`${idempotencyKeys.status} = 'pending' AND ${idempotencyKeys.createdAt} < now() - interval '10 minutes'`);
    // A 'done' row (incl. its stored responseBody) otherwise lives forever —
    // no TTL means the table only grows. 24h covers any realistic client
    // retry window for the Idempotency-Key convention this implements
    // (Stripe et al. use the same order of magnitude); a genuine re-issue
    // after that is meant to run again anyway, per withIdempotency's contract.
    await db
      .delete(idempotencyKeys)
      .where(sql`${idempotencyKeys.status} = 'done' AND ${idempotencyKeys.createdAt} < now() - interval '24 hours'`);
    // Market points: after 48h keep at most one point per 15 minutes.
    await thinMarketPoints();
    // Idempotency keys: one row per financially-meaningful write (proforma/
    // order/lead issuance). A row is only ever deleted on its own failure
    // path (see lib/server/utils/idempotency.ts) — successful ones are kept
    // forever otherwise, so this table grows without bound. 7 days is
    // comfortably past any realistic client retry window.
    await db.execute(sql`
      DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days'
    `);

    // ---- Append-only table retention (conservative; adjust per policy) ----
    // sms_log: delivery-debugging window — 90 days is far past any dispute
    // window for an OTP/notification text.
    await db.execute(sql`DELETE FROM sms_log WHERE at < now() - interval '90 days'`);
    // AI conversations (messages cascade via FK): the review/curation loop
    // works on recent answers; 90 days keeps /admin/ai relevant. Curated
    // corrections (ai_corrections) are permanent and carry the distilled
    // value forward, so nothing learned is lost by pruning raw threads.
    await db.execute(sql`DELETE FROM ai_conversations WHERE updated_at < now() - interval '90 days'`);
    // Per-request cost telemetry + raw feedback signals: two quarters for
    // trend analysis, then drop.
    await db.execute(sql`DELETE FROM ai_usage WHERE created_at < now() - interval '180 days'`);
    await db.execute(sql`DELETE FROM ai_feedback WHERE created_at < now() - interval '180 days'`);
    // price_sync_runs (entries cascade via FK): the automated mirror writes
    // one entry per considered SKU per run, twice a day, so this is the
    // fastest-growing table after sms_log. 180 days is two full quarters of
    // "why did this price change?" — well past the point where the answer
    // would still be actionable, and the prices themselves keep their own
    // permanent history in `price_points` regardless.
    await db.execute(sql`DELETE FROM price_sync_runs WHERE started_at < now() - interval '180 days'`);
    // audit_entries: accountability trail — keep a full year (deliberately the
    // longest window here; do NOT shorten without an operator decision).
    await db.execute(sql`DELETE FROM audit_entries WHERE at < now() - interval '365 days'`);
    // contact_messages are business correspondence — never auto-deleted.
  },
};
