import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';

// Explicit allowlist: never interpolate operator/user supplied identifiers.
const rules = {
  sms_log: ['at', 90], ai_conversations: ['updated_at', 90],
  ai_usage: ['created_at', 180], ai_feedback: ['created_at', 180],
  ai_budget_reservations: ['created_at', 1], price_sync_runs: ['started_at', 180],
  audit_entries: ['at', 365],
} as const;

/** Bounded work each hour. SKIP LOCKED keeps foreground edits moving.
 * Existing business retention windows are unchanged. Never prune financial
 * idempotency identities: an old replay must remain an old replay. */
export async function pruneRetainedTable(table: keyof typeof rules): Promise<number> {
  const [column, days] = rules[table];
  let deleted = 0;
  for (let batch = 0; batch < 10; batch++) {
    const result = await getDb().execute(sql`
      WITH doomed AS (
        SELECT ctid FROM ${sql.identifier(table)}
        WHERE ${sql.identifier(column)} < now() - ${days} * interval '1 day'
        ORDER BY ${sql.identifier(column)} LIMIT 500 FOR UPDATE SKIP LOCKED
      ) DELETE FROM ${sql.identifier(table)} WHERE ctid IN (SELECT ctid FROM doomed)
      RETURNING 1`);
    const rows = Array.isArray(result) ? result : result.rows;
    deleted += rows.length;
    if (rows.length < 500) break;
  }
  return deleted;
}
