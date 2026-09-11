// @vitest-environment node
/** updateOrderShipping — carrier tracking (US-08.4), independent of the
 *  status stepper's forward-only guard. Plus W17's fixes: cancelled orders
 *  stay visible to the customer instead of vanishing. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  createOrder,
  createWarehouseItem,
  updateOrderShipping,
  updateOrderStatus,
  cancelOrder,
  findOrderByRef,
  ordersForUser,
  adminListOrders,
  warehouseForUser,
  warehouseItemsPageForUser,
  InvalidStatusTransitionError,
} from './ordersRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function seedUser(): Promise<string> {
  const id = ulid();
  await db.insert(schema.users).values({ id, mobile: `0912${id.slice(-7)}` });
  return id;
}

/** Minimal lead row, inserted directly (not via insertLead) so a test can set
 *  assigneeId — adminListOrders' RBAC-support join reads it straight off
 *  this table. */
async function seedLead(opts: { assigneeId?: string; contactName?: string; contactMobile?: string } = {}): Promise<string> {
  const id = ulid();
  await db.insert(schema.leads).values({
    id,
    ref: `LD-${id}`,
    contactMobile: opts.contactMobile ?? `0912${id.slice(-7)}`,
    contactName: opts.contactName ?? null,
    source: 'cart',
    assigneeId: opts.assigneeId ?? null,
  });
  return id;
}

describe('updateOrderShipping', () => {
  it('rejects an unknown runtime shipment status without changing the order', async () => {
    const ref = `INVALID-${ulid()}`;
    await createOrder({ ref, items: [] });
    await expect(updateOrderStatus(ref, 'not_a_status' as never))
      .rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect((await findOrderByRef(ref))?.status).toBe('registered');
  });

  it('fails closed when persisted status is corrupt instead of promoting it', async () => {
    const ref = `CORRUPT-${ulid()}`;
    await createOrder({ ref, items: [] });
    await expect(db.update(schema.orders).set({ status: 'corrupt' as never }).where(eq(schema.orders.ref, ref)))
      .rejects.toThrow();
    expect((await findOrderByRef(ref))?.status).toBe('registered');
  });

  it('sets trackingNumber/carrierName on an order that started without them', async () => {
    const ref = `TRK-${ulid()}`;
    await createOrder({ ref, items: [] });

    const updated = await updateOrderShipping(ref, { trackingNumber: 'TIP-998877', carrierName: 'باربری تیپاکس' });
    expect(updated).toMatchObject({ trackingNumber: 'TIP-998877', carrierName: 'باربری تیپاکس' });

    const fetched = await findOrderByRef(ref);
    expect(fetched).toMatchObject({ trackingNumber: 'TIP-998877', carrierName: 'باربری تیپاکس' });
  });

  it('updates only the field(s) actually passed, leaving the other untouched', async () => {
    const ref = `TRK-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderShipping(ref, { trackingNumber: 'A', carrierName: 'B' });

    const updated = await updateOrderShipping(ref, { trackingNumber: 'A2' });
    expect(updated).toMatchObject({ trackingNumber: 'A2', carrierName: 'B' });
  });

  it('clears a field when explicitly set to null', async () => {
    const ref = `TRK-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderShipping(ref, { trackingNumber: 'A', carrierName: 'B' });

    const cleared = await updateOrderShipping(ref, { trackingNumber: null });
    expect(cleared).toMatchObject({ trackingNumber: undefined, carrierName: 'B' });
  });

  it('returns null for a ref that does not exist', async () => {
    await expect(updateOrderShipping('NOPE-NOT-REAL', { trackingNumber: 'x' })).resolves.toBeNull();
  });

  it('bumps lastUpdate, not just updatedAt, so the customer sees real progress', async () => {
    const ref = `TRK-${ulid()}`;
    const created = await createOrder({ ref, items: [] });
    const updated = await updateOrderShipping(ref, { trackingNumber: 'A' });
    expect(new Date(updated!.lastUpdate).getTime()).toBeGreaterThan(new Date(created.lastUpdate).getTime());
  });
});

describe('cancelOrder', () => {
  it('requires the explicit receipted return flow after shipment', async () => {
    const ref = `CNL-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderStatus(ref, 'confirmed');
    await updateOrderStatus(ref, 'loading');
    await updateOrderStatus(ref, 'in_transit');
    await expect(cancelOrder(ref)).rejects.toMatchObject({ code: 'return_required' });
  });

  it('cancels a non-delivered order and marks it, without deleting the row', async () => {
    const ref = `CNL-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderStatus(ref, 'confirmed');

    const cancelled = await cancelOrder(ref);
    expect(cancelled).toMatchObject({ status: 'confirmed', cancelled: true });
  });

  it('returns null (not a throw) for a ref that is already cancelled or does not exist', async () => {
    const ref = `CNL-${ulid()}`;
    await createOrder({ ref, items: [] });
    await cancelOrder(ref);
    await expect(cancelOrder(ref)).resolves.toBeNull();
    await expect(cancelOrder('NOPE-NOT-REAL')).resolves.toBeNull();
  });
});

describe('cancelled-order visibility (W17)', () => {
  it('findOrderByRef still returns a cancelled order, flagged, instead of 404-ing it out of existence', async () => {
    const ref = `VIS-${ulid()}`;
    await createOrder({ ref, items: [] });
    await cancelOrder(ref);

    const found = await findOrderByRef(ref);
    expect(found).toMatchObject({ ref, cancelled: true });
  });

  it('ordersForUser includes a cancelled order in the customer\'s own history', async () => {
    const userId = await seedUser();
    const ref = `VIS-${ulid()}`;
    await createOrder({ ref, userId, items: [] });
    await cancelOrder(ref);

    const { rows } = await ordersForUser(userId);
    expect(rows.find((o) => o.ref === ref)).toMatchObject({ cancelled: true });
  });

  it('a non-cancelled order reports cancelled: false', async () => {
    const ref = `VIS-${ulid()}`;
    await createOrder({ ref, items: [] });
    const found = await findOrderByRef(ref);
    expect(found).toMatchObject({ cancelled: false });
  });
});

describe('updateOrderStatus (W17)', () => {
  it('refuses to advance an order that has already been cancelled', async () => {
    const ref = `STA-${ulid()}`;
    await createOrder({ ref, items: [] });
    await cancelOrder(ref);
    await expect(updateOrderStatus(ref, 'confirmed')).resolves.toBeNull();
  });

  it('still enforces the forward-only guard', async () => {
    const ref = `STA-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderStatus(ref, 'confirmed');
    await updateOrderStatus(ref, 'loading');
    await expect(updateOrderStatus(ref, 'confirmed')).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });
});

// E-101: exhaustive (from, to) transition matrix over SHIPMENT_STATUSES.
// mutateOrder only ever advances a *live* order one step at a time via
// updateOrderStatus, so to reach every possible "before" status (including
// ones a real order could never sequentially be forced into for this test's
// purposes) this drives the `orders` row directly, exactly mirroring the
// code comment's own threat model: "an admin PATCH with no transition guard
// could otherwise silently regress ... with nothing but the raw enum
// check" — i.e. this simulates that raw write and proves the guard still
// catches it regardless of how `before.status` got there.
const SHIPMENT_STATUSES = ['registered', 'confirmed', 'loading', 'in_transit', 'delivered'] as const;
type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

async function forceStatus(ref: string, status: ShipmentStatus): Promise<void> {
  await db.update(schema.orders).set({ status }).where(eq(schema.orders.ref, ref));
}

describe('E-101: full order status transition matrix', () => {
  for (const from of SHIPMENT_STATUSES) {
    for (const to of SHIPMENT_STATUSES) {
      const fromIdx = SHIPMENT_STATUSES.indexOf(from);
      const toIdx = SHIPMENT_STATUSES.indexOf(to);

      if (toIdx < fromIdx) {
        it(`rejects ${from} -> ${to} (backward)`, async () => {
          const ref = `MTX-${ulid()}`;
          await createOrder({ ref, items: [] });
          await forceStatus(ref, from);
          await expect(updateOrderStatus(ref, to)).rejects.toBeInstanceOf(InvalidStatusTransitionError);
          // No side effect: status is unchanged.
          const found = await findOrderByRef(ref);
          expect(found?.status).toBe(from);
        });
        continue;
      }

      if (toIdx === fromIdx) {
        it(`${from} -> ${to} (no-op) is idempotent, not an error`, async () => {
          const ref = `MTX-${ulid()}`;
          await createOrder({ ref, items: [] });
          await forceStatus(ref, from);
          const result = await updateOrderStatus(ref, to);
          expect(result?.order.status).toBe(from);
        });
        continue;
      }

      if (toIdx > fromIdx + 1) {
        it(`rejects ${from} -> ${to} (skips a step)`, async () => {
          const ref = `MTX-${ulid()}`;
          await createOrder({ ref, items: [] });
          await forceStatus(ref, from);
          await expect(updateOrderStatus(ref, to)).rejects.toMatchObject({ code: 'skipped_transition' });
          const found = await findOrderByRef(ref);
          expect(found?.status).toBe(from);
        });
        continue;
      }

      // Exactly one step forward (toIdx === fromIdx + 1).
      if (to === 'delivered') {
        it(`rejects ${from} -> delivered without delivery proof (precondition unmet)`, async () => {
          const ref = `MTX-${ulid()}`;
          // Zero-item order: `!lines.length` in mutateOrder's delivery guard
          // makes this precondition permanently unsatisfiable, which is
          // itself the intended behavior — an empty order can never be
          // marked delivered.
          await createOrder({ ref, items: [] });
          await forceStatus(ref, from);
          await expect(updateOrderStatus(ref, to)).rejects.toMatchObject({ code: 'delivery_incomplete' });
          const found = await findOrderByRef(ref);
          expect(found?.status).toBe(from);
        });
      } else {
        it(`allows ${from} -> ${to} (single forward step)`, async () => {
          const ref = `MTX-${ulid()}`;
          await createOrder({ ref, items: [] });
          await forceStatus(ref, from);
          const result = await updateOrderStatus(ref, to);
          expect(result?.order.status).toBe(to);
        });
      }
    }
  }

  it('allows the last forward step (in_transit -> delivered) once every line item has a matching delivery receipt', async () => {
    const ref = `MTX-${ulid()}`;
    await createOrder({
      ref,
      items: [{ skuId: '', name: 'میلگرد', qty: 2, unit: 'piece', weightKg: 2000, unitPrice: 60000, lineTotal: 120000 }],
    });
    await updateOrderStatus(ref, 'confirmed');
    await updateOrderStatus(ref, 'loading');
    await updateOrderStatus(ref, 'in_transit');
    // Without any fulfillment record, delivery is still refused...
    await expect(updateOrderStatus(ref, 'delivered')).rejects.toMatchObject({ code: 'delivery_incomplete' });
    // ...and it's an actual quantity-matching precondition, not just "any
    // fulfillment row exists": a partial receipt for less than the ordered
    // qty must also still block it.
    const order = await findOrderByRef(ref);
    const orderItemId = order!.items[0]!.orderItemId!;
    const [orderRow] = await db.select().from(schema.orders).where(eq(schema.orders.ref, ref));
    await db.insert(schema.orderFulfillments).values({
      id: ulid(), orderItemId, kind: 'delivery', quantity: 1, proof: 'رسید جزئی',
    });
    await expect(updateOrderStatus(ref, 'delivered')).rejects.toMatchObject({ code: 'delivery_incomplete' });
    await db.insert(schema.orderFulfillments).values({
      id: ulid(), orderItemId, kind: 'delivery', quantity: 1, proof: 'رسید تکمیلی',
    });
    const result = await updateOrderStatus(ref, 'delivered');
    expect(result?.order.status).toBe('delivered');
    expect(orderRow).toBeTruthy();
  });

  it('cancel is only a clean status flip before shipment; in_transit/delivered require the receipted return flow', async () => {
    for (const from of ['registered', 'confirmed', 'loading'] as const) {
      const ref = `MTX-CNL-${ulid()}`;
      await createOrder({ ref, items: [] });
      await forceStatus(ref, from);
      const cancelled = await cancelOrder(ref);
      expect(cancelled).toMatchObject({ status: from, cancelled: true });
    }
    for (const from of ['in_transit', 'delivered'] as const) {
      const ref = `MTX-CNL-${ulid()}`;
      await createOrder({ ref, items: [] });
      await forceStatus(ref, from);
      await expect(cancelOrder(ref)).rejects.toMatchObject({ code: 'return_required' });
    }
  });
});

describe('adminListOrders (W17)', () => {
  it('exposes the source lead\'s assigneeId, for the client-side ownership check', async () => {
    const rep = await seedUser();
    const leadId = await seedLead({ assigneeId: rep });
    const ref = `ADM-${ulid()}`;
    await createOrder({ ref, leadId, items: [] });

    const { orders } = await adminListOrders({});
    expect(orders.find((o) => o.ref === ref)).toMatchObject({ leadAssigneeId: rep });
  });

  it('reports leadAssigneeId: null for an order with no source lead, or an unassigned one', async () => {
    const ref = `ADM-${ulid()}`;
    await createOrder({ ref, items: [] });
    const { orders } = await adminListOrders({});
    expect(orders.find((o) => o.ref === ref)).toMatchObject({ leadAssigneeId: null });
  });

  it('q matches by order ref', async () => {
    const ref = `ADM-UNIQ-${ulid()}`;
    await createOrder({ ref, items: [] });
    const { orders } = await adminListOrders({ q: ref });
    expect(orders.map((o) => o.ref)).toEqual([ref]);
  });

  it('q matches by the source lead\'s contact name or mobile', async () => {
    const leadId = await seedLead({ contactName: 'رضا محمدی', contactMobile: '09120000099' });
    const ref = `ADM-${ulid()}`;
    await createOrder({ ref, leadId, items: [] });

    expect((await adminListOrders({ q: 'رضا محمدی' })).orders.map((o) => o.ref)).toContain(ref);
    expect((await adminListOrders({ q: '09120000099' })).orders.map((o) => o.ref)).toContain(ref);
    expect((await adminListOrders({ q: 'no-such-customer-xyz' })).orders.map((o) => o.ref)).not.toContain(ref);
  });
});

describe('warehouseItemsPageForUser (E-116)', () => {
  it('pages newest-first with an exact total, and leaves warehouseForUser complete', async () => {
    const userId = await seedUser();
    // Five items with strictly increasing storedAt (createWarehouseItem
    // always stamps storedAt = now(), so insert with a tiny delay between
    // each to guarantee a stable, distinct order).
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const item = await createWarehouseItem({
        ref: `WH-${ulid()}`,
        userId,
        product: 'میلگرد',
        quantityTons: 1,
        monthlyFeeToman: 10_000,
        actorId: null,
      });
      ids.push(item.id);
      await new Promise((r) => setTimeout(r, 5));
    }

    const p1 = await warehouseItemsPageForUser(userId, 1, 2);
    expect(p1.total).toBe(5);
    expect(p1.page).toBe(1);
    expect(p1.perPage).toBe(2);
    expect(p1.rows).toHaveLength(2);

    const p2 = await warehouseItemsPageForUser(userId, 2, 2);
    expect(p2.total).toBe(5);
    expect(p2.rows).toHaveLength(2);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(4);

    const p3 = await warehouseItemsPageForUser(userId, 3, 2);
    expect(p3.rows).toHaveLength(1); // remainder
    expect(new Set([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id))).toEqual(new Set(ids));

    // The unpaged sibling is untouched: /api/me/export and the account SSR
    // page still get everything in one call.
    expect(await warehouseForUser(userId)).toHaveLength(5);
  });

  it('never lets one customer page into another customer\'s items (ownership scoping)', async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    for (let i = 0; i < 3; i++) {
      await createWarehouseItem({ ref: `WH-${ulid()}`, userId: owner, product: 'میلگرد', quantityTons: 1, actorId: null });
    }
    // The stranger has zero items — paging them, at any page number, must
    // never surface the owner's rows or a nonzero total.
    const strangerPage1 = await warehouseItemsPageForUser(stranger, 1, 10);
    expect(strangerPage1.total).toBe(0);
    expect(strangerPage1.rows).toHaveLength(0);
    const strangerPage2 = await warehouseItemsPageForUser(stranger, 2, 2);
    expect(strangerPage2.rows).toHaveLength(0);

    const ownerPage = await warehouseItemsPageForUser(owner, 1, 10);
    expect(ownerPage.total).toBe(3);
  });

  it('clamps page and perPage to sane bounds', async () => {
    const userId = await seedUser();
    await createWarehouseItem({ ref: `WH-${ulid()}`, userId, product: 'میلگرد', quantityTons: 1, actorId: null });
    const clamped = await warehouseItemsPageForUser(userId, -5, 10_000);
    expect(clamped.page).toBe(1);
    expect(clamped.perPage).toBe(100);
  });
});

describe('E-108: historical SKU code snapshot', () => {
  async function seedSku(): Promise<string> {
    const id = ulid();
    await db.insert(schema.categories).values({ id: `c-${id}`, slug: `cat-${id}`, name: 'دسته', order: 1, iconId: '' });
    await db.insert(schema.subCategories).values({ id: `s-${id}`, categoryId: `c-${id}`, slug: `sub-${id}`, name: 'زیردسته', order: 1 });
    await db.insert(schema.skus).values({ id, subCategoryId: `s-${id}`, categoryId: `c-${id}`, slug: `sku-original-${id}`, name: 'میلگرد آجدار ۱۴ اصفهان', unit: 'kg' });
    return id;
  }

  it('snapshots the SKU\'s slug as skuCode and its name at order-item creation, independent of the live row', async () => {
    const skuId = await seedSku();
    const ref = `SKU-${ulid()}`;
    await createOrder({
      ref,
      items: [{ skuId, name: 'میلگرد آجدار ۱۴ اصفهان', qty: 3, unit: 'kg', unitPrice: 60000, lineTotal: 180000 }],
    });

    const before = await findOrderByRef(ref);
    expect(before?.items[0]).toMatchObject({ skuCode: `sku-original-${skuId}`, name: 'میلگرد آجدار ۱۴ اصفهان', orderable: true });

    // Rename the live SKU (both its display name and its slug/code).
    await db.update(schema.skus).set({ name: 'میلگرد آجدار ۱۴ یزد (تغییرنام)', slug: `sku-renamed-${skuId}` }).where(eq(schema.skus.id, skuId));

    const after = await findOrderByRef(ref);
    // The order's own history does not move when the catalog does.
    expect(after?.items[0]).toMatchObject({ skuCode: `sku-original-${skuId}`, name: 'میلگرد آجدار ۱۴ اصفهان', orderable: true });
  });

  it('keeps the historical name and code unchanged after the live SKU is deleted, and clearly flags the line as no longer orderable', async () => {
    const skuId = await seedSku();
    const ref = `SKU-${ulid()}`;
    await createOrder({
      ref,
      items: [{ skuId, name: 'میلگرد آجدار ۱۴ اصفهان', qty: 3, unit: 'kg', unitPrice: 60000, lineTotal: 180000 }],
    });

    // Hard delete, exactly as the live product catalog does ("delete means
    // delete" — no soft-delete/trash bin for SKUs). The FK's ON DELETE SET
    // NULL nulls order_items.sku_id; historicalSkuId/skuCode/name must not.
    await db.delete(schema.skus).where(eq(schema.skus.id, skuId));

    const found = await findOrderByRef(ref);
    const item = found!.items[0]!;
    expect(item.name).toBe('میلگرد آجدار ۱۴ اصفهان');
    expect(item.skuCode).toBe(`sku-original-${skuId}`);
    expect(item.historicalSkuId).toBe(skuId);
    // The live link is genuinely gone, and that fact is explicit — not a
    // silently-substituted empty string a caller has to reinterpret.
    expect(item.skuId).toBe('');
    expect(item.orderable).toBe(false);
  });
});
