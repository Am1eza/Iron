/** Orders (cargo tracking) + consignment warehouse items. */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { orders, orderItems, warehouseItems, leads } from '@/lib/server/db/schema';
import type { LineItem, Order, WarehouseItem } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';

type OrderRow = typeof orders.$inferSelect;
type WarehouseRow = typeof warehouseItems.$inferSelect;

/** Thrown by updateOrderStatus/updateWarehouseItem on a backward transition. */
export class InvalidStatusTransitionError extends Error {}

// Canonical forward sequences (mirrors SHIPMENT_STEPS / WAREHOUSE_STATUS_LABEL
// in lib/types/domain.ts). Skipping ahead is allowed (e.g. an order that's
// already loaded when first registered in the system can jump straight to
// in_transit); moving to an EARLIER step is not — an admin PATCH with no
// transition guard could otherwise silently regress delivered→registered or
// released→stored with nothing but the raw enum check.
const ORDER_STATUS_ORDER: OrderRow['status'][] = ['registered', 'confirmed', 'loading', 'in_transit', 'delivered'];
const WAREHOUSE_STATUS_ORDER: WarehouseRow['status'][] = ['pending', 'stored', 'selling', 'released'];

function assertForwardTransition<T extends string>(order: T[], from: T, to: T): void {
  if (order.indexOf(to) < order.indexOf(from)) {
    throw new InvalidStatusTransitionError(`نمی‌توان وضعیت را از «${from}» به «${to}» (به عقب) تغییر داد.`);
  }
}

function toLineItem(r: typeof orderItems.$inferSelect): LineItem {
  return {
    skuId: r.skuId ?? '',
    name: r.name,
    qty: r.qty,
    unit: r.unit,
    weightKg: r.weightKg ?? undefined,
    unitPrice: r.unitPrice ?? undefined,
    lineTotal: r.lineTotal ?? undefined,
  };
}

function toOrderDto(r: OrderRow, items: LineItem[]): Order {
  return {
    ref: r.ref,
    placedAt: r.placedAt.toISOString(),
    items,
    status: r.status,
    lastUpdate: r.lastUpdate.toISOString(),
    trackingNumber: r.trackingNumber ?? undefined,
    carrierName: r.carrierName ?? undefined,
    cancelled: r.deletedAt !== null,
  };
}

async function itemsOf(orderId: string): Promise<LineItem[]> {
  const rows = await getDb().select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return rows.map(toLineItem);
}

/**
 * DTO assembly for a LIST of orders — one `inArray` query for every order's
 * items, grouped in JS, instead of one `itemsOf` query per order (the
 * previous `Promise.all(rows.map(toOrderDto))` pattern was N+1: an admin
 * page with 50 orders issued 51 queries against a 10-connection pool).
 */
async function toOrderDtos(rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const itemRows = await getDb()
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
  const byOrderId = new Map<string, LineItem[]>();
  for (const r of itemRows) {
    const list = byOrderId.get(r.orderId) ?? [];
    list.push(toLineItem(r));
    byOrderId.set(r.orderId, list);
  }
  return rows.map((r) => toOrderDto(r, byOrderId.get(r.id) ?? []));
}

/** Public tracking: ref is the capability (digits normalized, case-insensitive).
 *  INCLUDES cancelled/archived orders — someone tracking by ref already
 *  placed the order (or was given the ref by someone who did), so "this was
 *  cancelled" is real, useful information, not a dead end; hiding it used to
 *  make a legitimately-cancelled order's tracking page look identical to a
 *  ref that never existed. `Order.cancelled` is what the UI branches on. */
export async function findOrderByRef(rawRef: string): Promise<Order | null> {
  const ref = normalizeDigits(rawRef.trim()).toUpperCase();
  const rows = await getDb().select().from(orders).where(eq(orders.ref, ref)).limit(1);
  if (!rows[0]) return null;
  return toOrderDto(rows[0], await itemsOf(rows[0].id));
}

/** Paginated (was a hard `limit(100)` with no way past it — a customer with
 *  more than 100 shipments silently lost the rest). `limit+1`: one extra row
 *  signals `hasMore` without a separate `count(*)` scan, same convention as
 *  `leadsForUser`. Callers that just want a bounded "give me everything
 *  reasonable" snapshot (the account dashboard, the GDPR export) pass the max
 *  page size explicitly instead of paging through. */
/** A customer's own order history — INCLUDES cancelled ones. Hiding a
 *  cancelled order used to make it vanish without a trace the moment a rep
 *  cancelled it; `Order.cancelled` lets the account panel show it with a
 *  clear "لغوشده" badge instead of pretending it never happened. */
export async function ordersForUser(
  userId: string,
  page = 1,
  pageSize = 50,
): Promise<{ rows: Order[]; hasMore: boolean }> {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const p = Math.max(page, 1);
  const rows = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt))
    .limit(size + 1)
    .offset((p - 1) * size);
  const hasMore = rows.length > size;
  return { rows: await toOrderDtos(rows.slice(0, size)), hasMore };
}

/** Cancel/archive an order — pre-shipment (mis-registered, duplicate,
 *  customer changed their mind) AND post-delivery (a return): `clubRepo`
 *  deliberately counts only non-cancelled delivered orders, and
 *  `engagement.test.ts` exercises exactly this — cancelling a delivered
 *  order to model a return and confirms it downgrades the customer's club
 *  tier. An earlier pass here added a precondition blocking cancellation of
 *  a 'delivered' order on the theory that a completed deal shouldn't be
 *  undoable; that broke the return flow and its test, so returns are
 *  unrestricted by status, on purpose, same as before. Separate from the
 *  shipment `status` stepper — see the schema column comment. */
export async function cancelOrder(ref: string): Promise<Order | null> {
  const rows = await getDb()
    .update(orders)
    .set({ deletedAt: new Date(), lastUpdate: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
    .returning();
  if (!rows[0]) return null;
  // Symmetric with updateOrderStatus's delivered-transition recompute: a
  // return (cancelling a DELIVERED order) removes it from the buyer's
  // delivered-order count just as surely as advancing INTO delivered added
  // it, so their club tier needs recomputing here too — this was previously
  // only exercised by directly calling recomputeTier in a test, never by the
  // real cancelOrder() call path, so a real return left the tier stale until
  // something unrelated happened to trigger a recompute.
  if (rows[0].status === 'delivered' && rows[0].userId) {
    const userId = rows[0].userId;
    void import('@/lib/server/repos/clubRepo')
      .then((m) => m.recomputeTier(userId))
      .catch(() => {});
  }
  return toOrderDto(rows[0], await itemsOf(rows[0].id));
}

export async function createOrder(input: {
  ref: string;
  userId?: string;
  leadId?: string;
  items: LineItem[];
}): Promise<Order> {
  const db = getDb();
  const order = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(orders)
      .values({ id: ulid(), ref: input.ref, userId: input.userId ?? null, leadId: input.leadId ?? null })
      .returning();
    const row = inserted[0]!;
    if (input.items.length > 0) {
      await tx.insert(orderItems).values(
        input.items.map((item) => ({
          id: ulid(),
          orderId: row.id,
          skuId: item.skuId || null,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          weightKg: item.weightKg ?? null,
          unitPrice: item.unitPrice ?? null,
          lineTotal: item.lineTotal ?? null,
        })),
      );
    }
    return row;
  });
  // DTO assembly queries run outside the transaction (single-connection safe).
  return toOrderDto(order, input.items);
}

export async function updateOrderStatus(
  ref: string,
  status: OrderRow['status'],
): Promise<{ order: Order; prevStatus: OrderRow['status'] } | null> {
  const db = getDb();
  // Read, validate the forward-only transition, and write inside ONE
  // transaction with the read row locked (`for('update')`) — the previous
  // plain read-then-write let a concurrent request (this same function, or
  // cancelOrder) act on a stale read: two overlapping PATCHes could each
  // pass assertForwardTransition against the same "before" status, or a
  // cancellation land between the read and the write, leaving `status`
  // updated on an order that `deletedAt` says is gone. The lock serializes
  // concurrent callers on the same ref; the write's own `isNull(deletedAt)`
  // is the belt to the lock's suspenders.
  const result = await db.transaction(async (tx) => {
    const current = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
      .for('update')
      .limit(1);
    if (!current[0]) return null;
    assertForwardTransition(ORDER_STATUS_ORDER, current[0].status, status);
    const rows = await tx
      .update(orders)
      .set({ status, lastUpdate: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
      .returning();
    if (!rows[0]) return null;
    return { row: rows[0], prevStatus: current[0].status };
  });
  if (!result) return null;
  // A newly-delivered order changes the buyer's club points → recompute their
  // tier. Fire-and-forget; a club miss never blocks the shipment update. Only
  // on the transition INTO delivered, and only when the order has an owner.
  if (status === 'delivered' && result.prevStatus !== 'delivered' && result.row.userId) {
    const userId = result.row.userId;
    void import('@/lib/server/repos/clubRepo')
      .then((m) => m.recomputeTier(userId))
      .catch(() => {});
  }
  // `prevStatus` is returned (not just used internally above) so the route
  // layer can tell a genuine transition from a same-status no-op (a
  // double-click, a retried request after a timeout) — without it, the
  // caller has no race-proof way to know whether to fire a customer SMS.
  return { order: toOrderDto(result.row, await itemsOf(result.row.id)), prevStatus: result.prevStatus };
}

/** Set/clear carrier tracking info (US-08.4) — independent of the shipment
 *  `status` stepper, so it can be filled in at any point (e.g. as soon as a
 *  carrier is booked, before the order actually moves to 'loading'). */
export async function updateOrderShipping(
  ref: string,
  patch: { trackingNumber?: string | null; carrierName?: string | null },
): Promise<Order | null> {
  // lastUpdate bumps here too, not just on status changes — a customer
  // watching "آخرین به‌روزرسانی" should see it move the moment a rep enters a
  // tracking number, which is real, visible progress even with the shipment
  // stepper unchanged.
  const set: Partial<typeof orders.$inferInsert> = { updatedAt: new Date(), lastUpdate: new Date() };
  if (patch.trackingNumber !== undefined) set.trackingNumber = patch.trackingNumber;
  if (patch.carrierName !== undefined) set.carrierName = patch.carrierName;
  const rows = await getDb()
    .update(orders)
    .set(set)
    .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
    .returning();
  if (!rows[0]) return null;
  return toOrderDto(rows[0], await itemsOf(rows[0].id));
}

/** Admin-only ownership lookup — which lead (if any) this order traces back
 *  to, plus the current mutable fields, for the route layer's authorization
 *  check (canActOnAssignedRecord against the lead's assigneeId) and its
 *  audit-log "before" snapshot. Never exposed as a customer-facing DTO.
 *  Deliberately NOT filtered by deletedAt — the caller decides what an
 *  already-cancelled order should be allowed to do (today: nothing, since
 *  every mutator's own isNull(deletedAt) filter still applies). */
export async function orderOwnership(ref: string): Promise<{
  id: string;
  leadId: string | null;
  userId: string | null;
  status: OrderRow['status'];
  trackingNumber: string | null;
  carrierName: string | null;
} | null> {
  const rows = await getDb()
    .select({
      id: orders.id,
      leadId: orders.leadId,
      userId: orders.userId,
      status: orders.status,
      trackingNumber: orders.trackingNumber,
      carrierName: orders.carrierName,
    })
    .from(orders)
    .where(eq(orders.ref, ref))
    .limit(1);
  return rows[0] ?? null;
}

export async function adminListOrders(query: {
  status?: OrderRow['status'];
  page?: number;
  perPage?: number;
  /** Show cancelled/archived orders instead of the normal working set. */
  includeDeleted?: boolean;
  /** Matches ref, or the source lead's contact name/mobile. */
  q?: string;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(orders.deletedAt));
  if (query.status) conds.push(eq(orders.status, query.status));
  if (query.q) {
    conds.push(
      or(
        ilike(orders.ref, `%${query.q}%`),
        ilike(leads.contactMobile, `%${query.q}%`),
        ilike(leads.contactName, `%${query.q}%`),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      // Left-join the source lead: the admin card must show WHOSE order this
      // is (name + mobile), link back to the lead, AND (W17) know who is
      // allowed to act on it — assigneeId drives the client-side
      // canActOnAssignedRecord check so a non-owning rep never sees a
      // control the API would 403 anyway.
      .select({
        order: orders,
        leadName: leads.contactName,
        leadMobile: leads.contactMobile,
        leadAssigneeId: leads.assigneeId,
      })
      .from(orders)
      .leftJoin(leads, eq(orders.leadId, leads.id))
      .where(where)
      .orderBy(desc(orders.placedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(leads, eq(orders.leadId, leads.id))
      .where(where),
  ]);
  const dtos = await toOrderDtos(rows.map((r) => r.order));
  const withCustomer = dtos.map((o, i) => ({
    ...o,
    leadId: rows[i]?.order.leadId ?? null,
    customerName: rows[i]?.leadName ?? null,
    customerMobile: rows[i]?.leadMobile ?? null,
    leadAssigneeId: rows[i]?.leadAssigneeId ?? null,
  }));
  return { orders: withCustomer, total: total[0]?.n ?? 0 };
}

/* ---------------------------- warehouse ---------------------------- */

function toWarehouseDto(r: WarehouseRow): WarehouseItem {
  return {
    id: r.id,
    ref: r.ref,
    product: r.product,
    sizeLabel: r.sizeLabel ?? undefined,
    quantityTons: r.quantityTons,
    monthlyFeeToman: r.monthlyFeeToman,
    storedAt: r.storedAt.toISOString(),
    status: r.status,
  };
}

export async function warehouseForUser(userId: string): Promise<WarehouseItem[]> {
  const rows = await getDb()
    .select()
    .from(warehouseItems)
    .where(and(eq(warehouseItems.userId, userId), isNull(warehouseItems.deletedAt)))
    .orderBy(desc(warehouseItems.storedAt));
  return rows.map(toWarehouseDto);
}

export async function adminListWarehouse(
  query: { page?: number; perPage?: number; includeDeleted?: boolean } = {},
) {
  const db = getDb();
  const { users } = await import('@/lib/server/db/schema');
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const where = query.includeDeleted ? undefined : isNull(warehouseItems.deletedAt);
  const [rows, total] = await Promise.all([
    db
      .select({ item: warehouseItems, customerMobile: users.mobile, customerName: users.name })
      .from(warehouseItems)
      .innerJoin(users, eq(warehouseItems.userId, users.id))
      .where(where)
      .orderBy(desc(warehouseItems.storedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(warehouseItems).where(where),
  ]);
  return {
    // US-08.5 — customer mobile/name joined in for the per-customer
    // settlement report; `userId` stays too (stable grouping key even if a
    // customer edits their display name).
    items: rows.map((r) => ({
      ...toWarehouseDto(r.item),
      userId: r.item.userId,
      customerMobile: r.customerMobile,
      customerName: r.customerName,
    })),
    total: total[0]?.n ?? 0,
  };
}

/** Soft-delete — remove a mistakenly-created or duplicate warehouse entry
 *  from the working set without losing the record. */
export async function softDeleteWarehouseItem(id: string): Promise<WarehouseItem | null> {
  const rows = await getDb()
    .update(warehouseItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt)))
    .returning();
  return rows[0] ? toWarehouseDto(rows[0]) : null;
}

export async function createWarehouseItem(input: {
  ref: string;
  userId: string;
  product: string;
  sizeLabel?: string;
  quantityTons: number;
  monthlyFeeToman?: number;
}): Promise<WarehouseItem> {
  const rows = await getDb()
    .insert(warehouseItems)
    .values({
      id: ulid(),
      ref: input.ref,
      userId: input.userId,
      product: input.product,
      sizeLabel: input.sizeLabel ?? null,
      quantityTons: input.quantityTons,
      monthlyFeeToman: input.monthlyFeeToman ?? 0,
    })
    .returning();
  return toWarehouseDto(rows[0]!);
}

export async function updateWarehouseItem(
  id: string,
  patch: Partial<{ status: WarehouseRow['status']; monthlyFeeToman: number; quantityTons: number }>,
): Promise<WarehouseItem | null> {
  const db = getDb();
  if (patch.status) {
    const current = await db
      .select({ status: warehouseItems.status })
      .from(warehouseItems)
      .where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt)))
      .limit(1);
    if (!current[0]) return null;
    assertForwardTransition(WAREHOUSE_STATUS_ORDER, current[0].status, patch.status);
  }
  const rows = await db
    .update(warehouseItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt)))
    .returning();
  return rows[0] ? toWarehouseDto(rows[0]) : null;
}
