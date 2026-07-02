/** Audit log — append-only record of every admin/system write. */
import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { auditEntries } from '@/lib/server/db/schema';

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

export async function listAudit(query: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const conds = [];
  if (query.entityType) conds.push(eq(auditEntries.entityType, query.entityType));
  if (query.entityId) conds.push(eq(auditEntries.entityId, query.entityId));
  if (query.actorId) conds.push(eq(auditEntries.actorId, query.actorId));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(auditEntries)
    .where(where)
    .orderBy(desc(auditEntries.at))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(auditEntries).where(where);
  return { entries: rows, total: total[0]?.n ?? 0 };
}
