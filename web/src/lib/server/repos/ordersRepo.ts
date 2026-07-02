/** Orders (cargo tracking) + consignment warehouse items. */
import { desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { orders, orderItems, warehouseItems } from '@/lib/server/db/schema';
import type { LineItem, Order, WarehouseItem } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';

type OrderRow = typeof orders.$inferSelect;
type WarehouseRow = typeof warehouseItems.$inferSelect;

async function itemsOf(orderId: string): Promise<LineItem[]> {
  const rows = await getDb().select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return rows.map((r) => ({
    skuId: r.skuId ?? '',
    name: r.name,
    qty: r.qty,
    unit: r.unit,
    weightKg: r.weightKg ?? undefined,
    unitPrice: r.unitPrice ?? undefined,
    lineTotal: r.lineTotal ?? undefined,
  }));
}

async function toOrderDto(r: OrderRow): Promise<Order> {
  return {
    ref: r.ref,
    placedAt: r.placedAt.toISOString(),
    items: await itemsOf(r.id),
    status: r.status,
    lastUpdate: r.lastUpdate.toISOString(),
  };
}

/** Public tracking: ref is the capability (digits normalized, case-insensitive). */
export async function findOrderByRef(rawRef: string): Promise<Order | null> {
  const ref = normalizeDigits(rawRef.trim()).toUpperCase();
  const rows = await getDb().select().from(orders).where(eq(orders.ref, ref)).limit(1);
  return rows[0] ? toOrderDto(rows[0]) : null;
}

export async function ordersForUser(userId: string): Promise<Order[]> {
  const rows = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt))
    .limit(100);
  return Promise.all(rows.map(toOrderDto));
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
  return toOrderDto(order);
}

export async function updateOrderStatus(ref: string, status: OrderRow['status']): Promise<Order | null> {
  const rows = await getDb()
    .update(orders)
    .set({ status, lastUpdate: new Date(), updatedAt: new Date() })
    .where(eq(orders.ref, ref))
    .returning();
  return rows[0] ? toOrderDto(rows[0]) : null;
}

export async function adminListOrders(query: { status?: OrderRow['status']; page?: number; perPage?: number }) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const where = query.status ? eq(orders.status, query.status) : undefined;
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.placedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(where);
  return { orders: await Promise.all(rows.map(toOrderDto)), total: total[0]?.n ?? 0 };
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
    .where(eq(warehouseItems.userId, userId))
    .orderBy(desc(warehouseItems.storedAt));
  return rows.map(toWarehouseDto);
}

export async function adminListWarehouse(query: { page?: number; perPage?: number } = {}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 50;
  const rows = await db
    .select()
    .from(warehouseItems)
    .orderBy(desc(warehouseItems.storedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(warehouseItems);
  return { items: rows.map((r) => ({ ...toWarehouseDto(r), userId: r.userId })), total: total[0]?.n ?? 0 };
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
  const rows = await getDb()
    .update(warehouseItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(warehouseItems.id, id))
    .returning();
  return rows[0] ? toWarehouseDto(rows[0]) : null;
}
