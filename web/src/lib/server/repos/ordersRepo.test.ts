// @vitest-environment node
/** updateOrderShipping — carrier tracking (US-08.4), independent of the
 *  status stepper's forward-only guard. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import type { Db } from '@/lib/server/db/client';
import { createOrder, updateOrderShipping, findOrderByRef } from './ordersRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = (await createTestDb()) as { db: Db; close: () => Promise<void> });
}, 120_000);
afterAll(async () => {
  await close();
});

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
});
