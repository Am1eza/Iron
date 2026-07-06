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
    // audit_entries: accountability trail — keep a full year (deliberately the
    // longest window here; do NOT shorten without an operator decision).
    await db.execute(sql`DELETE FROM audit_entries WHERE at < now() - interval '365 days'`);
    // contact_messages are business correspondence — never auto-deleted.
  },
};
