/** Orders (cargo tracking) + consignment warehouse items. */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { orders, orderItems, warehouseItems, warehouseMovements, leads, proformas, orderEvents, orderFulfillments, operationOutbox, users, userRequests, warehouseReservations, warehouseSettlements, skus } from '@/lib/server/db/schema';
import type { LineItem, Order, WarehouseItem } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';
import { unsettledForMany } from '@/lib/server/repos/warehouseSettlementsRepo';
import { BusinessRuleError, financialAudit, safeMoney, stockGrams, businessOperation } from '@/lib/server/utils/businessOperation';
import type { AuthUser } from '@/lib/auth/types';
import { canActOnAssignedRecord } from '@/lib/auth/roles';
import { orderSmsNotification, orderStatusSmsNotification, orderShippingSmsNotification, orderCancelledSmsNotification } from '@/lib/server/services/leads.service';
import { recordBillingChange } from '@/lib/server/services/warehouseBilling';
import { likeContainsDigitVariants } from '@/lib/server/utils/likeEscape';

type OrderRow = typeof orders.$inferSelect;
type WarehouseRow = typeof warehouseItems.$inferSelect;
type WarehouseMovementRow = typeof warehouseMovements.$inferSelect;

/** A soft-delete or a force-delete was refused because the item still has an
 *  unsettled balance — the caller must settle it (or explicitly force,
 *  forfeiting the balance) before the record can be archived. */
export class UnsettledBalanceError extends Error {
  constructor(public amountToman: number) {
    super(`این کالا ${amountToman.toLocaleString('en-US')} تومان بدهیِ تسویه‌نشده دارد.`);
  }
}

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
  if (!order.includes(from) || !order.includes(to) || order.indexOf(to) < order.indexOf(from)) {
    throw new InvalidStatusTransitionError(`نمی‌توان وضعیت را از «${from}» به «${to}» (به عقب) تغییر داد.`);
  }
}

function toLineItem(r: typeof orderItems.$inferSelect): LineItem {
  return {
    ...r.snapshot,
    orderItemId: r.id,
    historicalSkuId: r.historicalSkuId ?? r.skuId ?? undefined,
    skuCode: r.skuCode ?? undefined,
    // Explicit boolean instead of leaving callers to re-derive
    // "no longer orderable" from `skuId === ''` (E-108) — the live FK is
    // gone (deleted SKU) exactly when this is false.
    orderable: r.skuId != null,
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
    terms: r.terms ?? undefined,
    placedAt: r.placedAt.toISOString(),
    items,
    status: r.status,
    lastUpdate: r.lastUpdate.toISOString(),
    trackingNumber: r.trackingNumber ?? undefined,
    carrierName: r.carrierName ?? undefined,
    cancelled: r.deletedAt !== null,
  };
}

async function withOrderEvidence(dtos: Order[], rows: OrderRow[]): Promise<Order[]> {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [events, fulfillments] = await Promise.all([
    getDb().select().from(orderEvents).where(inArray(orderEvents.orderId, ids)).orderBy(orderEvents.at, orderEvents.id),
    getDb().select({ fulfillment: orderFulfillments }).from(orderFulfillments)
      .innerJoin(orderItems, eq(orderItems.id, orderFulfillments.orderItemId)).where(inArray(orderItems.orderId, ids)),
  ]);
  const sums = new Map<string, { delivered: number; returned: number }>();
  for (const { fulfillment: f } of fulfillments) {
    const sum = sums.get(f.orderItemId) ?? { delivered: 0, returned: 0 };
    if (f.kind === 'delivery') sum.delivered += f.quantity; else sum.returned += f.quantity;
    sums.set(f.orderItemId, sum);
  }
  return dtos.map((dto, i) => ({ ...dto,
    events: events.filter(e => e.orderId === rows[i]!.id).map(e => ({ id: e.id, kind: e.kind, status: e.status, note: e.note, at: e.at.toISOString() })),
    items: dto.items.map(item => ({ ...item, deliveredQty: sums.get(item.orderItemId ?? '')?.delivered ?? 0, returnedQty: sums.get(item.orderItemId ?? '')?.returned ?? 0 })),
  }));
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
  return withOrderEvidence(rows.map((r) => toOrderDto(r, byOrderId.get(r.id) ?? [])), rows);
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
  return (await toOrderDtos(rows))[0] ?? null;
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

/** Complete owner-scoped export, independent of UI pagination. */
export async function exportOrderWarehouse(userId: string) {
  return getDb().transaction(async tx => {
    const orderRows = await tx.select().from(orders).where(eq(orders.userId,userId)).orderBy(orders.placedAt,orders.id);
    const lines = orderRows.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId,orderRows.map(o=>o.id))) : [];
    const stock = await tx.select().from(warehouseItems).where(eq(warehouseItems.userId,userId)).orderBy(warehouseItems.storedAt,warehouseItems.id);
    const movements = stock.length ? await tx.select().from(warehouseMovements).where(inArray(warehouseMovements.warehouseItemId,stock.map(i=>i.id))) : [];
    const { warehouseCashEntries, warehouseWithdrawals } = await import('@/lib/server/db/schema');
    const cash = await tx.select().from(warehouseCashEntries).where(eq(warehouseCashEntries.ownerId,userId));
    const withdrawals = await tx.select().from(warehouseWithdrawals).where(eq(warehouseWithdrawals.ownerId,userId));
    return { orders:orderRows.map(o=>toOrderDto(o,lines.filter(l=>l.orderId===o.id).map(toLineItem))),
      warehouseItems:stock.map(toWarehouseDto), movements:movements.map(({actorId:_actor,...m})=>{void _actor;return m;}),
      cash:cash.map(({actorId:_actor,...entry})=>{void _actor;return entry;}),withdrawals };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

/** Pre-shipment cancellation. Delivered goods require an explicit return. */
export async function cancelOrder(ref: string, actor?: AuthUser): Promise<Order | null> {
  const result = await mutateOrder(ref, { cancel: true }, actor);
  return result?.order ?? null;
}

export async function createOrder(input: {
  ref: string; userId?: string; leadId?: string; items: LineItem[];
  actor?: AuthUser; requireTerms?: boolean;
  terms?: NonNullable<OrderRow['terms']>;
}): Promise<Order> {
  const result = await getDb().transaction(async tx => {
    let ownerId = input.userId ?? null;
    let items = input.items;
    let terms: OrderRow['terms'] = input.terms ?? { currency: 'TOMAN', source: 'manual' };
    let mobile: string | null = null;
    if (input.leadId) {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt))).for('update');
      if (!lead) throw new BusinessRuleError('lead_not_found', 'سرنخ یافت نشد.', 404);
      if (input.actor && !canActOnAssignedRecord(input.actor, lead.assigneeId))
        throw new BusinessRuleError('lead_forbidden', 'سرنخ به کارشناس دیگری واگذار شده است.', 403);
      ownerId = lead.userId;
      mobile = lead.contactMobile;
      const [existing] = await tx.select().from(orders).where(eq(orders.leadId, lead.id));
      if (existing) {
        const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
        return toOrderDto(existing, lines.map(toLineItem));
      }
      const [quote] = await tx.select().from(proformas).where(and(eq(proformas.leadId, lead.id), eq(proformas.status, 'active')))
        .orderBy(desc(proformas.createdAt), desc(proformas.id)).limit(1).for('share');
      if (input.requireTerms && (!quote || quote.validUntil.getTime() <= Date.now()))
        throw new BusinessRuleError('quote_required', 'ابتدا پیش‌فاکتور معتبر شامل قیمت و شرایط معامله صادر کنید.');
      if (quote && quote.validUntil.getTime() > Date.now()) {
        items = quote.lines;
        terms = { currency: 'TOMAN', source: 'proforma', proformaRef: quote.ref, lines: quote.lines,
          subtotal: quote.subtotal, discountToman: quote.discountToman, volumeDiscountToman: quote.volumeDiscountToman,
          vatRate: quote.vatRate, vatAmount: quote.vatAmount, total: quote.total,
          validUntil: quote.validUntil.toISOString(), volumePolicyVersion: quote.volumePolicyVersion,
          paymentTerms: 'مطابق پیش‌فاکتور ثبت‌شده؛ تأیید پرداخت توسط کارشناس', deliveryTerms: 'هماهنگی تحویل مطابق پیش‌فاکتور' };
      }
      await tx.update(leads).set({ status: 'won', updatedAt: new Date() }).where(eq(leads.id, lead.id));
    }
    if (input.requireTerms && items.length === 0) throw new BusinessRuleError('empty_order', 'سفارش بدون قلم قابل ثبت نیست.');
    for (const item of items) {
      if (!Number.isFinite(item.qty) || item.qty <= 0) throw new BusinessRuleError('invalid_quantity', 'مقدار قلم معتبر نیست.', 400);
      if (item.unitPrice != null) safeMoney(item.unitPrice, 10000000000000);
      if (item.lineTotal != null) safeMoney(item.lineTotal);
    }
    const [row] = await tx.insert(orders).values({ id: ulid(), ref: input.ref, userId: ownerId, leadId: input.leadId ?? null, terms }).returning();
    if (!row) throw new Error('Business write returned no row');
    // E-108: snapshot each item's SKU *code* (its `slug`, the human-facing
    // identity) at creation time, batched in one query — independent of
    // `historicalSkuId` (the row id) and of the live, possibly-later-renamed
    // or -deleted `skuId` FK. A missing/unknown skuId simply gets no code.
    const skuIds = [...new Set(items.map(item => item.skuId).filter((id): id is string => Boolean(id)))];
    const skuCodeById = new Map<string, string>();
    if (skuIds.length) {
      const skuRows = await tx.select({ id: skus.id, slug: skus.slug }).from(skus).where(inArray(skus.id, skuIds));
      for (const s of skuRows) skuCodeById.set(s.id, s.slug);
    }
    const lines = items.length ? await tx.insert(orderItems).values(items.map(item => ({
      id: ulid(), orderId: row.id, skuId: item.skuId || null, historicalSkuId: item.skuId || null,
      skuCode: item.skuId ? skuCodeById.get(item.skuId) ?? null : null,
      snapshot: item, name: item.name, qty: item.qty, unit: item.unit,
      weightKg: item.weightKg ?? null, unitPrice: item.unitPrice ?? null, lineTotal: item.lineTotal ?? null,
    }))).returning() : [];
    await tx.insert(orderEvents).values({ id: ulid(), orderId: row.id, kind: 'created', status: row.status,
      note: 'سفارش ثبت شد', actorId: input.actor?.id ?? null });
    await financialAudit(tx, input.actor?.id ?? null, 'order.create', 'order', row.id, null, { ref: row.ref, terms, items });
    if (mobile) await tx.insert(operationOutbox).values({ id: `order-created:${row.id}`, mobile, message: `سفارش ${row.ref} ثبت شد`, notification: orderSmsNotification(row.ref, null) });
    return toOrderDto(row, lines.map(toLineItem));
  });
  return result;
}

export async function mutateOrder(ref: string, patch: {
  status?: OrderRow['status']; trackingNumber?: string | null; carrierName?: string | null;
  cancel?: boolean; note?: string;
}, actor?: AuthUser): Promise<{ order: Order; prevStatus: OrderRow['status'] } | null> {
  return getDb().transaction(async tx => {
    const [before] = await tx.select().from(orders).where(eq(orders.ref, ref)).for('update');
    if (!before || before.deletedAt) return null;
    let mobile: string | null = null, name: string | null = null;
    if (before.leadId) {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, before.leadId)).for('share');
      if (actor && lead && !canActOnAssignedRecord(actor, lead.assigneeId))
        throw new BusinessRuleError('order_forbidden', 'این سفارش به کارشناس دیگری واگذار شده است.', 403);
      mobile = lead?.contactMobile ?? null; name = lead?.contactName ?? null;
    }
    if (!mobile && before.userId) {
      const [user] = await tx.select().from(users).where(eq(users.id, before.userId));
      mobile = user?.mobile ?? null; name = user?.name ?? null;
    }
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, before.id));
    const next = patch.status ?? before.status;
    assertForwardTransition(ORDER_STATUS_ORDER, before.status, next);
    if (ORDER_STATUS_ORDER.indexOf(next) > ORDER_STATUS_ORDER.indexOf(before.status) + 1)
      throw new BusinessRuleError('skipped_transition', 'مراحل سفارش باید به‌ترتیب ثبت شوند.');
    if (next === 'delivered' && before.status !== 'delivered') {
      const delivered = lines.length ? await tx.select().from(orderFulfillments).where(inArray(orderFulfillments.orderItemId, lines.map(l => l.id))) : [];
      if (!lines.length || lines.some(line => delivered.filter(d => d.orderItemId === line.id).reduce((n,d) => n + (d.kind === 'delivery' ? d.quantity : -d.quantity), 0) < line.qty))
        throw new BusinessRuleError('delivery_incomplete', 'ابتدا رسید تحویل تمام اقلام را ثبت کنید.');
    }
    if (patch.cancel && ['in_transit','delivered'].includes(before.status))
      throw new BusinessRuleError('return_required', 'کالای ارسال‌شده باید با رسید برگشت ثبت شود؛ لغو ساده مجاز نیست.');
    const changed = next !== before.status || patch.cancel ||
      (patch.trackingNumber !== undefined && patch.trackingNumber !== before.trackingNumber) ||
      (patch.carrierName !== undefined && patch.carrierName !== before.carrierName);
    if (!changed) return { order: toOrderDto(before, lines.map(toLineItem)), prevStatus: before.status };
    if (patch.cancel && lines.length) {
      await tx.update(warehouseReservations).set({ status: 'released' }).where(and(
        inArray(warehouseReservations.orderItemId, lines.map(l => l.id)), eq(warehouseReservations.status, 'reserved')));
    }
    const [after] = await tx.update(orders).set({ status: next,
      trackingNumber: patch.trackingNumber === undefined ? before.trackingNumber : patch.trackingNumber,
      carrierName: patch.carrierName === undefined ? before.carrierName : patch.carrierName,
      deletedAt: patch.cancel ? new Date() : null, updatedAt: new Date(),
      lastUpdate: sql`greatest(${orders.lastUpdate} + interval '1 millisecond', clock_timestamp())`,
    }).where(eq(orders.id, before.id)).returning();
    if (!after) throw new Error('Business write returned no row');
    const eventId = ulid();
    const note = patch.note ?? (patch.cancel ? 'سفارش پیش از ارسال لغو شد' : next !== before.status ? `وضعیت سفارش: ${next}` : 'اطلاعات حمل به‌روزرسانی شد');
    await tx.insert(orderEvents).values({ id: eventId, orderId: before.id, kind: patch.cancel ? 'cancelled' : next !== before.status ? 'status' : 'shipping', status: next, note, actorId: actor?.id ?? null });
    await financialAudit(tx, actor?.id ?? null, 'order.update', 'order', before.id, before, { ...after, note });
    if (mobile) {
      const notification = patch.cancel ? orderCancelledSmsNotification(ref, name) : next !== before.status && next !== 'registered'
        ? orderStatusSmsNotification(ref, name, next) : after.trackingNumber
          ? orderShippingSmsNotification(ref, name, after.trackingNumber, after.carrierName) : null;
      if (notification) await tx.insert(operationOutbox).values({ id: eventId, mobile, message: notification.fallbackText, notification });
    }
    return { order: toOrderDto(after, lines.map(toLineItem)), prevStatus: before.status };
  });
}

export async function updateOrderStatus(ref: string, status: OrderRow['status'], actor?: AuthUser) {
  return mutateOrder(ref, { status }, actor);
}

export async function updateOrderShipping(ref: string, patch: { trackingNumber?: string | null; carrierName?: string | null }, actor?: AuthUser): Promise<Order | null> {
  return (await mutateOrder(ref, patch, actor))?.order ?? null;
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
  // Clamp: the route only floors this (Math.max(1, ...)), so an unbounded
  // perPage turned a paginated CRM into a one-request dump of every
  // customer name and mobile. Matches articlesRepo/catalogAdminRepo/
  // alertsRepo, which already clamp. Done in the repo, not the route, so
  // internal callers (admin/search) are covered too.
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 50)));
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(orders.deletedAt));
  if (query.status) conds.push(eq(orders.status, query.status));
  if (query.q) {
    // Both digit spellings — ref/mobile are Latin-only in the DB, and the
    // «جستجو: شماره سفارش، نام یا موبایل مشتری…» box is typed on whichever
    // keyboard layout the rep's machine happens to be on.
    const terms = likeContainsDigitVariants(query.q);
    conds.push(
      or(
        ...terms.flatMap((q) => [ilike(orders.ref, q), ilike(leads.contactMobile, q), ilike(leads.contactName, q)]),
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
    version: r.version,
    ref: r.ref,
    product: r.product,
    sizeLabel: r.sizeLabel ?? undefined,
    quantityTons: r.quantityTons,
    monthlyFeeToman: r.monthlyFeeToman,
    storedAt: r.storedAt.toISOString(),
    arrivedAt: r.arrivedAt?.toISOString(),
    releasedAt: r.releasedAt?.toISOString(),
    location: r.location ?? undefined,
    contractRef: r.contractRef ?? undefined,
    insured: r.insured,
    status: r.status,
  };
}

/** Attach each item's live unsettled balance (W20) in a single query.
 *  This was one query per item behind an unbounded Promise.all; even bounded
 *  at ≤100 rows that is 100 concurrent queries against a 10-connection pool,
 *  which is pool starvation for every other request on the worker, not just a
 *  slow page of its own. */
async function withBalances(items: WarehouseItem[], rows: WarehouseRow[]): Promise<WarehouseItem[]> {
  const balances = await unsettledForMany(rows);
  return items.map((item, i) => ({ ...item, unsettledToman: balances[i]!.amountToman }));
}

export async function warehouseForUser(userId: string): Promise<WarehouseItem[]> {
  const rows = await getDb()
    .select()
    .from(warehouseItems)
    .where(and(eq(warehouseItems.userId, userId), isNull(warehouseItems.deletedAt)))
    .orderBy(desc(warehouseItems.storedAt));
  return withBalances(rows.map(toWarehouseDto), rows);
}

/** One page of a customer's own warehouse items — a SIBLING of
 *  warehouseForUser (E-116), never a replacement: /api/me/export and the
 *  account page's SSR list still need the complete, unpaginated set.
 *  `warehouseForUser` had no limit at all, unlike the already-paginated
 *  settlements list (`settlementsPageForUser`); this closes that gap for
 *  callers (e.g. a future mobile client hitting /api/me/warehouse) that want
 *  a bounded page instead of a full dump. Scoped strictly to `userId` — the
 *  same ownership filter as warehouseForUser — so paging never lets a caller
 *  reach another customer's rows. */
export async function warehouseItemsPageForUser(
  userId: string,
  page = 1,
  perPage = 50,
): Promise<{ rows: WarehouseItem[]; total: number; page: number; perPage: number }> {
  const db = getDb();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePerPage = Math.min(100, Math.max(1, Math.trunc(perPage) || 50));
  const where = and(eq(warehouseItems.userId, userId), isNull(warehouseItems.deletedAt))!;
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(warehouseItems)
      .where(where)
      // `id` breaks ties so offset paging is deterministic when several
      // items share a storedAt timestamp.
      .orderBy(desc(warehouseItems.storedAt), desc(warehouseItems.id))
      .limit(safePerPage)
      .offset((safePage - 1) * safePerPage),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(warehouseItems).where(where),
  ]);
  const total = counted[0]?.n ?? 0;
  return { rows: await withBalances(rows.map(toWarehouseDto), rows), total, page: safePage, perPage: safePerPage };
}

export async function adminListWarehouse(
  query: { page?: number; perPage?: number; includeDeleted?: boolean; status?: WarehouseRow['status']; q?: string } = {},
) {
  const db = getDb();
  const { users } = await import('@/lib/server/db/schema');
  const page = query.page ?? 1;
  // Clamp: the route only floors this (Math.max(1, ...)), so an unbounded
  // perPage turned a paginated CRM into a one-request dump of every
  // customer name and mobile. Matches articlesRepo/catalogAdminRepo/
  // alertsRepo, which already clamp. Done in the repo, not the route, so
  // internal callers (admin/search) are covered too.
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 50)));
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(warehouseItems.deletedAt));
  if (query.status) conds.push(eq(warehouseItems.status, query.status));
  if (query.q?.trim()) {
    // `ref`/`mobile` are Latin-only but `product` is free Persian text that
    // may itself carry Persian digits — matching both spellings is what lets
    // one box cover both column kinds. See likeContainsDigitVariants.
    const terms = likeContainsDigitVariants(query.q.trim());
    conds.push(
      or(
        ...terms.flatMap((q) => [
          ilike(warehouseItems.ref, q),
          ilike(warehouseItems.product, q),
          ilike(users.name, q),
          ilike(users.mobile, q),
        ]),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({ item: warehouseItems, customerMobile: users.mobile, customerName: users.name })
      .from(warehouseItems)
      .innerJoin(users, eq(warehouseItems.userId, users.id))
      .where(where)
      .orderBy(desc(warehouseItems.storedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(warehouseItems)
      .innerJoin(users, eq(warehouseItems.userId, users.id))
      .where(where),
  ]);
  const dtos = await withBalances(
    rows.map((r) => toWarehouseDto(r.item)),
    rows.map((r) => r.item),
  );
  return {
    // US-08.5 — customer mobile/name joined in for the per-customer
    // settlement report; `userId` stays too (stable grouping key even if a
    // customer edits their display name).
    items: dtos.map((dto, i) => ({
      ...dto,
      userId: rows[i]!.item.userId,
      customerMobile: rows[i]!.customerMobile,
      customerName: rows[i]!.customerName,
    })),
    total: total[0]?.n ?? 0,
  };
}

/** Soft-delete — remove a mistakenly-created or duplicate warehouse entry
 *  from the working set without losing the record. Refuses when the item
 *  still has an unsettled balance (W20) unless `force` is set — a silent
 *  delete used to make a real, owed amount vanish from every view with no
 *  warning; `force` exists for the legitimate "customer stopped paying,
 *  remove it anyway" case, and is deliberately still logged with the
 *  forfeited amount by the caller (see the route's audit call). */
export async function softDeleteWarehouseItem(id: string, opts: { force?: boolean; actorId?: string; reason?: string } = {}): Promise<WarehouseRow | null> {
  return getDb().transaction(async tx => {
    const [item] = await tx.select().from(warehouseItems).where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt))).for('update');
    if (!item) return null;
    if (item.quantityTons > 0) throw new BusinessRuleError('stock_remaining', 'تا زمانی که کالا در انبار است، بایگانی مجاز نیست.');
    const { lastSettlementFor } = await import('./warehouseSettlementsRepo');
    const last = await lastSettlementFor(id, tx);
    if (item.status !== 'pending' && (!last || last.periodTo < (item.releasedAt ?? new Date())))
      throw new BusinessRuleError('unsettled_period', 'ابتدا دورهٔ نگهداری را تسویه کنید.');
    const [unpaid] = await tx.select({ id: warehouseSettlements.id }).from(warehouseSettlements).where(and(
      eq(warehouseSettlements.warehouseItemId, id), isNull(warehouseSettlements.paidAt), isNull(warehouseSettlements.voidedAt),
      isNull(warehouseSettlements.voidsSettlementId), sql`${warehouseSettlements.amountToman}>0`)).limit(1);
    if (unpaid) throw new BusinessRuleError('unpaid_settlement', 'صورتحساب پرداخت‌نشده باید پیش از بایگانی تعیین تکلیف شود.');
    const [after] = await tx.update(warehouseItems).set({ deletedAt: new Date(), updatedAt: new Date(), version: item.version + 1 })
      .where(eq(warehouseItems.id, id)).returning();
    if (!after) throw new Error('Business write returned no row');
    await financialAudit(tx, opts.actorId ?? null, 'warehouse.archive', 'warehouseItem', id, item, { ...after, reason: opts.reason ?? 'بایگانی کالای بدون موجودی و بدهی' });
    return after;
  });
}

async function recordMovement(
  tx: DbOrTx,
  warehouseItemId: string,
  kind: (typeof warehouseMovements.$inferInsert)['kind'],
  deltaTons: number,
  quantityAfterTons: number,
  actorId: string | null,
  note?: string,
  operationId?: string,
): Promise<void> {
  await tx.insert(warehouseMovements).values({
    id: ulid(),
    warehouseItemId,
    operationId,
    kind,
    deltaTons,
    quantityAfterTons,
    actorId,
    note: note ?? null,
  });
}

export async function warehouseMovementsForItem(warehouseItemId: string): Promise<WarehouseMovementRow[]> {
  return getDb()
    .select()
    .from(warehouseMovements)
    .where(eq(warehouseMovements.warehouseItemId, warehouseItemId))
    .orderBy(desc(warehouseMovements.createdAt));
}

/** Lets the movements route tell "real item, no history yet" (200, empty
 *  array) apart from "no such item" (404) instead of both looking identical. */
export async function warehouseItemExists(warehouseItemId: string): Promise<boolean> {
  const rows = await getDb().select({ id: warehouseItems.id }).from(warehouseItems).where(eq(warehouseItems.id, warehouseItemId)).limit(1);
  return rows.length > 0;
}

export async function createWarehouseItem(input: {
  ref: string;
  userId: string;
  product: string;
  sizeLabel?: string;
  quantityTons: number;
  monthlyFeeToman?: number;
  arrivedAt?: Date;
  location?: string;
  receivedBy?: string;
  intakeNote?: string;
  contractRef?: string;
  insured?: boolean;
  leadId?: string;
  requestId?: string;
  actorId: string | null;
  operationId?: string;
}): Promise<WarehouseItem> {
  stockGrams(input.quantityTons); safeMoney(input.monthlyFeeToman ?? 0, 1000000000);
  if (input.quantityTons <= 0) throw new BusinessRuleError('invalid_quantity', 'مقدار ورود باید مثبت باشد.', 400);
  if (input.arrivedAt && (!Number.isFinite(input.arrivedAt.getTime()) || input.arrivedAt > new Date()))
    throw new BusinessRuleError('invalid_arrival', 'تاریخ ورود نمی‌تواند نامعتبر یا در آینده باشد.', 400);
  const { ref: _ref, operationId: _key, ...identity } = input;
  void _ref; void _key;
  return businessOperation(`warehouse-intake:${input.requestId ?? input.operationId ?? input.ref}`, identity, async tx => {
    if (input.requestId) {
      const [request] = await tx.select().from(userRequests).where(eq(userRequests.id, input.requestId)).for('update');
      if (!request || request.type !== 'warehouse' || request.userId !== input.userId || (input.leadId && request.leadId !== input.leadId))
        throw new BusinessRuleError('ownership_mismatch', 'درخواست، سرنخ و مالک کالا با هم مطابقت ندارند.');
      if (request.status === 'fulfilled') throw new BusinessRuleError('already_received', 'این درخواست قبلاً تحویل گرفته شده است.');
    }
    if (input.leadId) {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).for('share');
      if (!lead || lead.userId !== input.userId) throw new BusinessRuleError('ownership_mismatch', 'مالک سرنخ با مالک کالا مطابقت ندارد.');
    }
    const inserted = await tx
      .insert(warehouseItems)
      .values({
        id: ulid(),
        ref: input.ref,
        userId: input.userId,
        product: input.product,
        sizeLabel: input.sizeLabel ?? null,
        quantityTons: input.quantityTons,
        monthlyFeeToman: input.monthlyFeeToman ?? 0,
        arrivedAt: input.arrivedAt ?? null,
        location: input.location ?? null,
        receivedBy: input.receivedBy ?? null,
        intakeNote: input.intakeNote ?? null,
        contractRef: input.contractRef ?? null,
        insured: input.insured ?? false,
        leadId: input.leadId ?? null,
        requestId: input.requestId ?? null,
      })
      .returning();
    const item = inserted[0]!;
    await recordMovement(tx, item.id, 'receipt', input.quantityTons, input.quantityTons, input.actorId, input.intakeNote, `receipt:${item.id}`);
    if (input.requestId) await tx.update(userRequests).set({ status: 'fulfilled', updatedAt: new Date() }).where(eq(userRequests.id, input.requestId));
    await financialAudit(tx, input.actorId, 'warehouse.create', 'warehouseItem', item.id, null, item);
    return toWarehouseDto(item);
  });
}

export async function updateWarehouseItem(
  id: string,
  patch: Partial<{
    status: WarehouseRow['status'];
    monthlyFeeToman: number;
    quantityTons: number;
    location: string | null;
    contractRef: string | null;
    insured: boolean;
    arrivedAt: Date | null;
  }>,
  actorId: string | null = null,
  movementNote?: string,
  opts: { tx?: DbOrTx; expectedVersion?: number; operationId?: string } = {},
): Promise<{ before: WarehouseRow; after: WarehouseRow } | null> {
  const write = async (tx: DbOrTx) => {
    // Row-locked read-modify-write (W20) — was an unlocked read outside any
    // transaction, the exact TOCTOU the orders equivalent was already fixed
    // for: two concurrent PATCHes could each pass the forward-transition
    // check against the same stale "before" status.
    const current = await tx
      .select()
      .from(warehouseItems)
      .where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt)))
      .for('update')
      .limit(1);
    if (!current[0]) return null;
    const before = current[0];
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== before.version)
      throw new BusinessRuleError('stale_version', 'اطلاعات این کالا تغییر کرده است؛ صفحه را تازه کنید و دوباره بررسی کنید.');
    if (patch.quantityTons !== undefined) stockGrams(patch.quantityTons);
    if (patch.monthlyFeeToman !== undefined) safeMoney(patch.monthlyFeeToman, 1000000000);
    if (patch.arrivedAt !== undefined && (patch.arrivedAt?.getTime() ?? null) !== (before.arrivedAt?.getTime() ?? null) && before.status !== 'pending')
      throw new BusinessRuleError('arrival_frozen', 'تاریخ ورود پس از آغاز نگهداری قابل بازنویسی نیست؛ اصلاح با سند جبرانی انجام شود.');
    if (patch.arrivedAt && (!Number.isFinite(patch.arrivedAt.getTime()) || patch.arrivedAt > new Date()))
      throw new BusinessRuleError('invalid_arrival', 'تاریخ ورود معتبر و غیرآینده لازم است.', 400);
    if (before.status === 'released' && (patch.quantityTons !== undefined && patch.quantityTons !== 0))
      throw new BusinessRuleError('released_item', 'ورود مجدد باید به‌عنوان رسید تازه ثبت شود.');
    if (patch.status) assertForwardTransition(WAREHOUSE_STATUS_ORDER, before.status, patch.status);

    const at = new Date();
    const set: Partial<typeof warehouseItems.$inferInsert> = { ...patch, updatedAt: at, version: before.version + 1 };
    if (patch.status === 'released' || patch.quantityTons === 0) { set.status = 'released'; set.quantityTons = 0; }
    if (set.status === 'released' && !before.releasedAt) set.releasedAt = at;
    const quantity = set.quantityTons ?? before.quantityTons;
    const reservations = await tx.select({ n: sql<number>`coalesce(sum(${warehouseReservations.quantityTons}),0)`.mapWith(Number) })
      .from(warehouseReservations).where(and(eq(warehouseReservations.warehouseItemId, id), eq(warehouseReservations.status, 'reserved')));
    if (stockGrams(quantity) < stockGrams(reservations[0]?.n ?? 0))
      throw new BusinessRuleError('reserved_stock', 'بخشی از موجودی رزرو شده است؛ ابتدا همان عملیات را آزاد یا تحویل کنید.');
    await recordBillingChange(tx, before, { ...before, ...set } as WarehouseRow, at, actorId, movementNote ?? 'تغییر مقدار یا تعرفه');

    const rows = await tx
      .update(warehouseItems)
      .set(set)
      .where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt)))
      .returning();
    const after = rows[0]!;

    if (quantity !== before.quantityTons) {
      const delta = (stockGrams(quantity) - stockGrams(before.quantityTons)) / 1_000_000;
      await recordMovement(tx, id, delta < 0 ? 'release' : 'adjustment', delta, quantity, actorId, movementNote, opts.operationId);
    }
    await financialAudit(tx, actorId, 'warehouse.update', 'warehouseItem', id, before, { ...after, reason: movementNote ?? 'تغییر مشخصات کالا' });
    return { before, after };
  };
  return opts.tx ? write(opts.tx) : getDb().transaction(write);
}
