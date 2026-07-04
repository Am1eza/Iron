/**
 * Hourly upkeep — purge expired OTPs / refresh tokens / stale rate rows and
 * thin market history so the ticker table never grows unbounded.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { cleanupExpiredAuth } from '@/lib/auth/store';
import { idempotencyKeys } from '@/lib/server/db/schema';
import type { Job } from './scheduler';

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
  },
};
