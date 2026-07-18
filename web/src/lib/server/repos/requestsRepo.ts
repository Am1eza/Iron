/** The per-user requests inbox («درخواست‌های من») — server home of the old localStorage store. */
import { desc, eq, sql, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { userRequests } from '@/lib/server/db/schema';

export type UserRequestRow = typeof userRequests.$inferSelect;

export interface UserRequestDto {
  id: string;
  ref: string;
  type: UserRequestRow['type'];
  title: string;
  detail?: string;
  note?: string;
  createdAt: string;
  status: UserRequestRow['status'];
}

export function toRequestDto(r: UserRequestRow): UserRequestDto {
  return {
    id: r.id,
    ref: r.ref,
    type: r.type,
    title: r.title,
    detail: r.detail ?? undefined,
    note: r.note ?? undefined,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
  };
}

/** Paginated (was a hard `limit(200)` with no way past it). `limit+1`: one
 *  extra row signals `hasMore` without a separate `count(*)` scan, same
 *  convention as `leadsForUser`/`ordersForUser`. */
export async function requestsForUser(
  userId: string,
  page = 1,
  pageSize = 50,
): Promise<{ rows: UserRequestDto[]; hasMore: boolean }> {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const p = Math.max(page, 1);
  const rows = await getDb()
    .select()
    .from(userRequests)
    .where(eq(userRequests.userId, userId))
    .orderBy(desc(userRequests.createdAt))
    .limit(size + 1)
    .offset((p - 1) * size);
  return { rows: rows.slice(0, size).map(toRequestDto), hasMore: rows.length > size };
}

export async function insertRequest(input: {
  userId: string;
  ref: string;
  type: UserRequestRow['type'];
  title: string;
  detail?: string;
  note?: string;
  leadId?: string;
  createdAt?: Date;
  status?: UserRequestRow['status'];
}, dbh: DbOrTx = getDb()): Promise<UserRequestDto | null> {
  const rows = await dbh
    .insert(userRequests)
    .values({
      id: ulid(),
      ref: input.ref,
      userId: input.userId,
      type: input.type,
      title: input.title,
      detail: input.detail ?? null,
      note: input.note ?? null,
      leadId: input.leadId ?? null,
      status: input.status ?? 'submitted',
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .onConflictDoNothing({ target: userRequests.ref }) // idempotent import
    .returning();
  return rows[0] ? toRequestDto(rows[0]) : null;
}

export async function updateRequestStatus(id: string, status: UserRequestRow['status']) {
  const rows = await getDb()
    .update(userRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(userRequests.id, id))
    .returning();
  return rows[0] ? toRequestDto(rows[0]) : null;
}

export async function adminListRequests(query: {
  status?: UserRequestRow['status'];
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const where = query.status ? and(eq(userRequests.status, query.status)) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(userRequests)
      .where(where)
      .orderBy(desc(userRequests.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userRequests)
      .where(where),
  ]);
  return { requests: rows, total: total[0]?.n ?? 0 };
}
