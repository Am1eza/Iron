// @vitest-environment node
/**
 * A product with no `current_prices` row at all is not hidden — the price
 * table left-joins, so it ships to customers as «تماس بگیرید», which is a
 * defensible lead-gen state and exactly why nothing ever complained about it.
 *
 * What was missing was anyone noticing. Production carried seven on
 * 1405/06/01, the oldest five days old, and neither dashboard tile could see
 * them: `stalePrices` counts rows in `current_prices`, which is the table
 * they are absent from. `priceSync` cannot close the gap either — it logs
 * `skip:low-confidence-match` for all seven because the only size-compatible
 * source row is a different mill.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { listActiveSkuIdsWithoutPrice, tableRows } from './catalogRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-ibeam', slug: 'ibeam', name: 'تیرآهن', order: 1, iconId: '', isActive: true },
    { id: 'c-off', slug: 'wire', name: 'کلاف', order: 2, iconId: '', isActive: false },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-tirahan', categoryId: 'c-ibeam', slug: 'tirahan', name: 'تیرآهن', order: 1, isActive: true },
    { id: 's-off', categoryId: 'c-ibeam', slug: 'light', name: 'سبک', order: 2, isActive: false },
    { id: 's-under-off-cat', categoryId: 'c-off', slug: 'coil', name: 'کلاف', order: 1, isActive: true },
  ]);
  const sku = (id: string, subId: string, catId: string, name: string) => ({
    id,
    subCategoryId: subId,
    categoryId: catId,
    slug: id,
    name,
    unit: 'kg' as const,
    isActive: true,
  });
  await db.insert(schema.skus).values([
    sku('priced', 's-tirahan', 'c-ibeam', 'تیرآهن ۱۴ ذوب آهن'),
    sku('unpriced-faico', 's-tirahan', 'c-ibeam', 'تیرآهن ۱۶ فایکو'),
    sku('unpriced-zafar', 's-tirahan', 'c-ibeam', 'تیرآهن ۱۶ ظفر بناب'),
    { ...sku('retired', 's-tirahan', 'c-ibeam', 'تیرآهن بازنشسته'), isActive: false },
    sku('stranded-sub', 's-off', 'c-ibeam', 'تیرآهن سبک ۱۸'),
    sku('stranded-cat', 's-under-off-cat', 'c-off', 'کلاف ۶.۵'),
  ]);
  await db.insert(schema.currentPrices).values({
    skuId: 'priced',
    price: 41_200,
    unit: 'kg',
    priceBasis: 'kg',
    updatedAt: new Date(),
  });
}, 120_000);

afterAll(async () => {
  await close();
});

describe('listActiveSkuIdsWithoutPrice', () => {
  it('lists exactly the active, customer-visible products with no price row', async () => {
    expect((await listActiveSkuIdsWithoutPrice()).sort()).toEqual(['unpriced-faico', 'unpriced-zafar']);
  });

  it('scopes to one category for the pricing grid', async () => {
    expect((await listActiveSkuIdsWithoutPrice('ibeam')).sort()).toEqual([
      'unpriced-faico',
      'unpriced-zafar',
    ]);
  });

  it('does not report a deliberately retired product', async () => {
    expect(await listActiveSkuIdsWithoutPrice()).not.toContain('retired');
  });

  it('does not report a product already hidden by its taxonomy', async () => {
    // These have their own tile (`countSkusHiddenByTaxonomy`) and their own
    // fix — reactivating the parent, not typing a price. Counting them here
    // too would send the operator to a grid that cannot show them.
    const ids = await listActiveSkuIdsWithoutPrice();
    expect(ids).not.toContain('stranded-sub');
    expect(ids).not.toContain('stranded-cat');
  });

  it('names rows the admin grid DOES list — the gap is the number, not the row', async () => {
    // The distinction the grid cannot draw on its own: `tableRows` left-joins,
    // so an unpriced product is present and looks like any other blank cell.
    const rows = await tableRows('ibeam', undefined, { forAdmin: true });
    const listed = new Set(rows.map((r) => r.id));
    for (const id of await listActiveSkuIdsWithoutPrice('ibeam')) expect(listed.has(id)).toBe(true);
  });
});
