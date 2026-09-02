// @vitest-environment node
/**
 * `skuImpact` used to be decorative: the confirm dialog read it, but the
 * DELETE route never did, so a `curl -X DELETE` (or a bulk-delete request)
 * could take down a product mid-shipment along with the order line
 * referencing it. `openOrders` is the one field of `CatalogImpact` this
 * layer now enforces — the route/API layer 409s on it unless overridden
 * (see `openOrdersBlock` in catalogRoute.ts and the bulk-delete route); this
 * file proves the repo-level primitives those layers are built on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { deleteSkusBulk, skuIdsWithOpenOrders, skuImpact } from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([{ id: 'c-1', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' }]);
  await db.insert(schema.subCategories).values([
    { id: 's-1', categoryId: 'c-1', slug: 'deformed', name: 'آجدار', order: 1 },
  ]);
  await db.insert(schema.skus).values([
    { id: 'k-shipping', subCategoryId: 's-1', categoryId: 'c-1', slug: 'k-shipping', name: 'در حال حمل', unit: 'kg' },
    { id: 'k-delivered', subCategoryId: 's-1', categoryId: 'c-1', slug: 'k-delivered', name: 'تحویل‌شده', unit: 'kg' },
    { id: 'k-free', subCategoryId: 's-1', categoryId: 'c-1', slug: 'k-free', name: 'بدون سفارش', unit: 'kg' },
  ]);
  await db.insert(schema.orders).values([
    { id: 'o-open', ref: 'IR-1', status: 'in_transit' },
    { id: 'o-done', ref: 'IR-2', status: 'delivered' },
  ]);
  await db.insert(schema.orderItems).values([
    { id: 'oi-1', orderId: 'o-open', skuId: 'k-shipping', name: 'در حال حمل', qty: 1, unit: 'kg' },
    // A DELIVERED order referencing k-delivered must NOT count as open — the
    // shipment already happened, there is nothing left in flight to protect.
    { id: 'oi-2', orderId: 'o-done', skuId: 'k-delivered', name: 'تحویل‌شده', qty: 1, unit: 'kg' },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('what a delete would disturb, for the open-order guard specifically', () => {
  it('flags a product on an in-transit order as unsafe to delete', async () => {
    const impact = await skuImpact('k-shipping');
    expect(impact.openOrders).toBe(1);
  });

  it('does not flag a product whose only order already delivered', async () => {
    const impact = await skuImpact('k-delivered');
    expect(impact.openOrders).toBe(0);
  });

  it('does not flag a product with no order at all', async () => {
    const impact = await skuImpact('k-free');
    expect(impact.openOrders).toBe(0);
  });
});

describe('skuIdsWithOpenOrders — the batch form the bulk-delete route checks', () => {
  it('names only the ids genuinely blocked, out of a mixed batch', async () => {
    const blocked = await skuIdsWithOpenOrders(['k-shipping', 'k-delivered', 'k-free']);
    expect(blocked).toEqual(['k-shipping']);
  });

  it('is empty for an all-clear batch', async () => {
    expect(await skuIdsWithOpenOrders(['k-delivered', 'k-free'])).toEqual([]);
  });
});

describe('deleteSkusBulk — one transaction for the whole batch', () => {
  it('removes every id in the batch and reports only the ones that actually existed', async () => {
    const removed = await deleteSkusBulk(['k-free', 'k-delivered', 'nonexistent-id']);
    expect(removed.map((r) => r.id).sort()).toEqual(['k-delivered', 'k-free']);
  });
});
