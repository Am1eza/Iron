/** Audit log — append-only record of every admin/system write. */
import { and, desc, eq, gte, lte, lt, or, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { auditEntries, users } from '@/lib/server/db/schema';

export type AuditRow = typeof auditEntries.$inferSelect;
/** `listAudit`/`listAuditForExport` rows carry the actor's display name/mobile
 *  alongside the raw `actorId` (US-23.2 — the admin UI showed only the raw id
 *  before). `null` when the actor account was deleted (actorId FK is
 *  `ON DELETE SET NULL`) or the write was system-initiated (no actor). */
export type AuditRowWithActor = AuditRow & { actorName: string | null; actorMobile: string | null };

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

export interface AuditFilterQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  /** Exact action string (e.g. 'user.update') — free-text column, no enum. */
  action?: string;
  /** Inclusive range on `at`. */
  from?: Date;
  to?: Date;
}

/** Shared WHERE-builder for listAudit/listAuditForExport — keeps the filter
 *  set identical between the paged admin view and the CSV export. */
function auditFilterConds(query: AuditFilterQuery): SQL[] {
  const conds: SQL[] = [];
  if (query.entityType) conds.push(eq(auditEntries.entityType, query.entityType));
  if (query.entityId) conds.push(eq(auditEntries.entityId, query.entityId));
  if (query.actorId) conds.push(eq(auditEntries.actorId, query.actorId));
  if (query.action) conds.push(eq(auditEntries.action, query.action));
  if (query.from) conds.push(gte(auditEntries.at, query.from));
  if (query.to) conds.push(lte(auditEntries.at, query.to));
  return conds;
}

const auditWithActorSelect = {
  id: auditEntries.id,
  actorId: auditEntries.actorId,
  action: auditEntries.action,
  entityType: auditEntries.entityType,
  entityId: auditEntries.entityId,
  before: auditEntries.before,
  after: auditEntries.after,
  at: auditEntries.at,
  actorName: users.name,
  actorMobile: users.mobile,
} as const;

/**
 * Keyset ("cursor") pagination instead of OFFSET: this table is append-only
 * and only ever grows, so `OFFSET n` gets linearly slower for every later
 * page, and a plain `count(*)` (the old total-count query) is a full-table
 * scan on every single request. `WHERE (at, id) < (cursor.at, cursor.id)`
 * seeks directly via `audit_entries_at_id_idx` regardless of how deep the
 * page is, and there's no total to compute — the caller gets a `nextCursor`
 * and asks again if it wants more (see AuditLog.tsx's "load more").
 */
export async function listAudit(
  query: AuditFilterQuery & { cursor?: string; limit?: number },
): Promise<{ entries: AuditRowWithActor[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const conds = auditFilterConds(query);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    // Row-value comparison: strictly older than the cursor's (at, id) pair,
    // tie-broken by id so two entries in the same millisecond never repeat
    // or skip across a page boundary.
    conds.push(
      or(
        lt(auditEntries.at, cursor.at),
        and(eq(auditEntries.at, cursor.at), lt(auditEntries.id, cursor.id)),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select(auditWithActorSelect)
    .from(auditEntries)
    .leftJoin(users, eq(auditEntries.actorId, users.id))
    .where(where)
    .orderBy(desc(auditEntries.at), desc(auditEntries.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { entries: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null };
}

/** Single-shot (no cursor), capped export query — same filters as `listAudit`,
 *  reused by the CSV export route. Capped rather than unbounded: an unbounded
 *  `text/csv` response on a growing append-only table is its own DoS risk. */
const AUDIT_EXPORT_MAX_ROWS = 5000;
export async function listAuditForExport(query: AuditFilterQuery): Promise<AuditRowWithActor[]> {
  const db = getDb();
  const conds = auditFilterConds(query);
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select(auditWithActorSelect)
    .from(auditEntries)
    .leftJoin(users, eq(auditEntries.actorId, users.id))
    .where(where)
    .orderBy(desc(auditEntries.at), desc(auditEntries.id))
    .limit(AUDIT_EXPORT_MAX_ROWS);
}
