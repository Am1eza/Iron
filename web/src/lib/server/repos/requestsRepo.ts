/** The per-user requests inbox («درخواست‌های من») — server home of the old localStorage store. */
import { desc, eq, ne, sql, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { userRequests, users, leads } from '@/lib/server/db/schema';

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
    // W20: scoped to (userId, ref), matching the schema's now-per-user unique
    // index — was a bare `ref` target against a GLOBALLY unique column while
    // `ref` itself was a client-supplied, low-entropy value (the mock store's
    // localStorage→import path), so two different customers' independently-
    // minted refs could collide and the second one silently vanished here.
    .onConflictDoNothing({ target: [userRequests.userId, userRequests.ref] })
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

export interface AdminRequestDto extends UserRequestDto {
  customerName: string | null;
  customerMobile: string;
}

/** W20: joins the customer's name/mobile in (a rep could not act on a
 *  request without leaving this page before — no way to call the customer
 *  back), and accepts a `type` filter so warehouse asks are separable from
 *  proforma/bulk ones instead of being buried among them. */
export async function adminListRequests(query: {
  status?: UserRequestRow['status'];
  type?: UserRequestRow['type'];
  page?: number;
  perPage?: number;
}): Promise<{ requests: AdminRequestDto[]; total: number }> {
  const db = getDb();
  const page = query.page ?? 1;
  // Clamp: the route only floors this (Math.max(1, ...)), so an unbounded
  // perPage turned a paginated CRM into a one-request dump of every
  // customer name and mobile. Matches articlesRepo/catalogAdminRepo/
  // alertsRepo, which already clamp. Done in the repo, not the route, so
  // internal callers (admin/search) are covered too.
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 50)));
  const conds = [];
  if (query.status) conds.push(eq(userRequests.status, query.status));
  if (query.type) conds.push(eq(userRequests.type, query.type));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ request: userRequests, customerName: users.name, customerMobile: users.mobile })
      .from(userRequests)
      .innerJoin(users, eq(userRequests.userId, users.id))
      .where(where)
      .orderBy(desc(userRequests.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userRequests)
      .where(where),
  ]);
  return {
    requests: rows.map((r) => ({ ...toRequestDto(r.request), customerName: r.customerName, customerMobile: r.customerMobile })),
    total: total[0]?.n ?? 0,
  };
}

export interface PendingWarehouseRequestDto {
  id: string;
  ref: string;
  leadId: string | null;
  customerName: string | null;
  customerMobile: string;
  /** From the source lead's context.warehouse (W20 createWarehouseRequest) —
   *  null for a legacy row with no lead behind it, so the intake queue still
   *  shows something (customer + note) instead of silently hiding it. */
  product: string | null;
  quantityTons: number | null;
  duration: string | null;
  note: string | null;
  createdAt: string;
}

/** The admin warehouse intake queue (W21): every 'warehouse'-type request
 *  NOT YET marked 'fulfilled' — the piece that was completely missing before
 *  this: a customer's submitted request had no visible path into the actual
 *  intake form, so a rep had to know about it some other way and re-type
 *  everything by hand. Excludes 'fulfilled' rather than requiring
 *  'submitted' specifically — a request a rep already started following up
 *  on (status advanced to 'reviewing'/'contacted') still needs to show up
 *  here until the goods are actually received. */
export async function pendingWarehouseRequests(): Promise<PendingWarehouseRequestDto[]> {
  const rows = await getDb()
    .select({ request: userRequests, customerName: users.name, customerMobile: users.mobile, leadContext: leads.context })
    .from(userRequests)
    .innerJoin(users, eq(userRequests.userId, users.id))
    .leftJoin(leads, eq(userRequests.leadId, leads.id))
    .where(and(eq(userRequests.type, 'warehouse'), ne(userRequests.status, 'fulfilled')))
    .orderBy(desc(userRequests.createdAt));
  return rows.map((r) => {
    const wh = r.leadContext?.warehouse;
    return {
      id: r.request.id,
      ref: r.request.ref,
      leadId: r.request.leadId,
      customerName: r.customerName,
      customerMobile: r.customerMobile,
      product: wh?.product ?? null,
      quantityTons: wh?.quantityTons ?? null,
      duration: wh?.duration ?? null,
      note: r.request.note ?? null,
      createdAt: r.request.createdAt.toISOString(),
    };
  });
}
