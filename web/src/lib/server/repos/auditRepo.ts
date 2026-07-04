/** Audit log — append-only record of every admin/system write. */
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { auditEntries } from '@/lib/server/db/schema';

export type AuditRow = typeof auditEntries.$inferSelect;

export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await getDb().insert(auditEntries).values({
    id: ulid(),
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** Opaque keyset cursor — `${at.getTime()}_${id}` of the last row on the
 *  previous page, base64'd so callers never depend on its shape. */
function encodeCursor(row: Pick<AuditRow, 'at' | 'id'>): string {
  return Buffer.from(`${row.at.getTime()}_${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('_');
    if (!ms || !id) return null;
    const at = new Date(Number(ms));
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/**
 * Keyset ("cursor") pagination instead of OFFSET: this table is append-only
 * and only ever grows, so `OFFSET n` gets linearly slower for every later
 * page, and a plain `count(*)` (the old total-count query) is a full-table
 * scan on every single request. `WHERE (at, id) < (cursor.at, cursor.id)`
 * seeks directly via `audit_entries_at_id_idx` regardless of how deep the
 * page is, and there's no total to compute — the caller gets a `nextCursor`
 * and asks again if it wants more (see AuditLog.tsx's "load more").
 */
export async function listAudit(query: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ entries: AuditRow[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const conds = [];
  if (query.entityType) conds.push(eq(auditEntries.entityType, query.entityType));
  if (query.entityId) conds.push(eq(auditEntries.entityId, query.entityId));
  if (query.actorId) conds.push(eq(auditEntries.actorId, query.actorId));
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    // Row-value comparison: strictly older than the cursor's (at, id) pair,
    // tie-broken by id so two entries in the same millisecond never repeat
    // or skip across a page boundary.
    conds.push(
      or(
        lt(auditEntries.at, cursor.at),
        and(eq(auditEntries.at, cursor.at), lt(auditEntries.id, cursor.id)),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(auditEntries)
    .where(where)
    .orderBy(desc(auditEntries.at), desc(auditEntries.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { entries: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null };
}
