// @vitest-environment node
/** updateOrderShipping — carrier tracking (US-08.4), independent of the
 *  status stepper's forward-only guard. Plus W17's fixes: cancelled orders
 *  stay visible to the customer instead of vanishing. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  createOrder,
  updateOrderShipping,
  updateOrderStatus,
  cancelOrder,
  findOrderByRef,
  ordersForUser,
  adminListOrders,
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
  it('cancels a DELIVERED order too — this is the return flow, relied on by engagement.test.ts\'s club-tier downgrade', async () => {
    const ref = `CNL-${ulid()}`;
    await createOrder({ ref, items: [] });
    await updateOrderStatus(ref, 'confirmed');
    await updateOrderStatus(ref, 'loading');
    await updateOrderStatus(ref, 'in_transit');
    await updateOrderStatus(ref, 'delivered');

    const cancelled = await cancelOrder(ref);
    expect(cancelled).toMatchObject({ status: 'delivered', cancelled: true });
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
    await updateOrderStatus(ref, 'loading');
    await expect(updateOrderStatus(ref, 'confirmed')).rejects.toBeInstanceOf(InvalidStatusTransitionError);
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
