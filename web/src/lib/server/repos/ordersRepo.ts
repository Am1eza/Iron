/** Orders (cargo tracking) + consignment warehouse items. */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { orders, orderItems, warehouseItems } from '@/lib/server/db/schema';
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
 *  Excludes cancelled/archived orders — "gone means gone" for tracking too. */
export async function findOrderByRef(rawRef: string): Promise<Order | null> {
  const ref = normalizeDigits(rawRef.trim()).toUpperCase();
  const rows = await getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
    .limit(1);
  if (!rows[0]) return null;
  return toOrderDto(rows[0], await itemsOf(rows[0].id));
}

/** Paginated (was a hard `limit(100)` with no way past it — a customer with
 *  more than 100 shipments silently lost the rest). `limit+1`: one extra row
 *  signals `hasMore` without a separate `count(*)` scan, same convention as
 *  `leadsForUser`. Callers that just want a bounded "give me everything
 *  reasonable" snapshot (the account dashboard, the GDPR export) pass the max
 *  page size explicitly instead of paging through. */
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
    .where(and(eq(orders.userId, userId), isNull(orders.deletedAt)))
    .orderBy(desc(orders.placedAt))
    .limit(size + 1)
    .offset((p - 1) * size);
  const hasMore = rows.length > size;
  return { rows: await toOrderDtos(rows.slice(0, size)), hasMore };
}

/** Cancel/archive an order (mis-registered, duplicate, customer cancelled
 *  before shipment) — separate from the shipment `status` stepper, see the
 *  schema column comment. */
export async function cancelOrder(ref: string): Promise<Order | null> {
  const rows = await getDb()
    .update(orders)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
    .returning();
  if (!rows[0]) return null;
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

export async function updateOrderStatus(ref: string, status: OrderRow['status']): Promise<Order | null> {
  const db = getDb();
  const current = await db
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.ref, ref), isNull(orders.deletedAt)))
    .limit(1);
  if (!current[0]) return null;
  assertForwardTransition(ORDER_STATUS_ORDER, current[0].status, status);
  const rows = await db
    .update(orders)
    .set({ status, lastUpdate: new Date(), updatedAt: new Date() })
    .where(eq(orders.ref, ref))
    .returning();
  if (!rows[0]) return null;
  // A newly-delivered order changes the buyer's club points → recompute their
  // tier. Fire-and-forget; a club miss never blocks the shipment update. Only
  // on the transition INTO delivered, and only when the order has an owner.
  if (status === 'delivered' && current[0].status !== 'delivered' && rows[0].userId) {
    const userId = rows[0].userId;
    void import('@/lib/server/repos/clubRepo')
      .then((m) => m.recomputeTier(userId))
      .catch(() => {});
  }
  return toOrderDto(rows[0], await itemsOf(rows[0].id));
}

export async function adminListOrders(query: {
  status?: OrderRow['status'];
  page?: number;
  perPage?: number;
  /** Show cancelled/archived orders instead of the normal working set. */
  includeDeleted?: boolean;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(orders.deletedAt));
  if (query.status) conds.push(eq(orders.status, query.status));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.placedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);
  return { orders: await toOrderDtos(rows), total: total[0]?.n ?? 0 };
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
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const where = query.includeDeleted ? undefined : isNull(warehouseItems.deletedAt);
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(warehouseItems)
      .where(where)
      .orderBy(desc(warehouseItems.storedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(warehouseItems).where(where),
  ]);
  return { items: rows.map((r) => ({ ...toWarehouseDto(r), userId: r.userId })), total: total[0]?.n ?? 0 };
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
