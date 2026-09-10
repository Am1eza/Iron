/**
 * F-131 — Postgres-backed fixed-window rate limiter. The last-resort tier in
 * `rateLimit()` (server/utils/rateLimit.ts), used ONLY for the scopes where a
 * fragmented per-worker quota during a Redis outage is a real security
 * regression, not just a UX/cost nicety — see rateLimit.ts's `DB_FALLBACK_SCOPES`
 * and the doc comment on `rateLimitWindows` in db/schema/system.ts.
 *
 * Same fixed-window bucketing as redisRateCheck (server/redis.ts): the bucket
 * number is baked into the row's primary key, so counting is just "does this
 * bucket's row exist, and what's its count" — no separate expiry check is
 * needed for correctness (a new bucket number is simply a new row).
 */
import { sql } from 'drizzle-orm';
import { getDb, hasDb } from '@/lib/server/db/client';
import { rateLimitWindows } from '@/lib/server/db/schema';

/**
 * Atomic fixed-window rate check against Postgres. Returns `true` (over
 * limit) / `false` (under), or `null` when there is no database to fall back
 * to (mock/dev without DATABASE_URL) — the caller then falls through to the
 * per-process window as a last resort, same as it always did.
 *
 * ONE statement does the read-check-increment: `INSERT ... ON CONFLICT DO
 * UPDATE SET count = count + 1 RETURNING count`. Postgres takes a row-level
 * lock for the duration of the upsert, so of N concurrent requests hitting
 * the same bucket, each sees a strictly-increasing, never-repeated `count` —
 * there is no read-then-write window for two workers to both observe "under
 * limit" and both proceed, which is exactly the race an in-memory-per-worker
 * fallback cannot close.
 */
export async function dbRateCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  if (!hasDb()) return null;
  try {
    const bucket = Math.floor(Date.now() / windowMs);
    const bucketKey = `${key}:${bucket}`;
    const expiresAt = (bucket + 1) * windowMs;
    const rows = await getDb()
      .insert(rateLimitWindows)
      .values({ key: bucketKey, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitWindows.key,
        set: { count: sql`${rateLimitWindows.count} + 1` },
      })
      .returning({ count: rateLimitWindows.count });
    const count = rows[0]?.count ?? 0;
    return count > limit;
  } catch {
    // A DB hiccup on TOP of a Redis outage must not 500 the request — fall
    // through to the in-process window rather than fail closed here.
    return null;
  }
}
