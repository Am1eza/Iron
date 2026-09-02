// @vitest-environment node
/**
 * What a delete confirm is allowed to claim.
 *
 * The dialog described the largest destructive action in the panel from
 * numbers the BROWSER was holding: `category.skuCount` and
 * `subCategory.skuCount`, as old as the last list fetch. A category rendered
 * «۰ کالا» could take hundreds of products with it, and nothing in the
 * sentence the admin agreed to would have said so.
 *
 * And what it did count, it counted thinly: `hasPrice` was a boolean, so
 * eighteen months of price history behind a public chart and a product priced
 * once yesterday read exactly the same — while the history is the one thing
 * here that cannot be re-entered from a supplier's list on Monday morning.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { categoryImpact, skuImpact, subCategoryImpact } from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());

  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' },
    // Deliberately left empty, to pin the zero case.
    { id: 'c-empty', slug: 'empty', name: 'خالی', order: 2, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-deformed', categoryId: 'c-rebar', slug: 'deformed', name: 'آجدار', order: 1 },
    { id: 's-plain', categoryId: 'c-rebar', slug: 'plain', name: 'ساده', order: 2 },
  ]);
  await db.insert(schema.skus).values([
    { id: 'k-1', subCategoryId: 's-deformed', categoryId: 'c-rebar', slug: 'k-1', name: 'میلگرد ۱۴', unit: 'kg' },
    { id: 'k-2', subCategoryId: 's-deformed', categoryId: 'c-rebar', slug: 'k-2', name: 'میلگرد ۱۶', unit: 'kg' },
    { id: 'k-3', subCategoryId: 's-plain', categoryId: 'c-rebar', slug: 'k-3', name: 'میلگرد ساده ۱۲', unit: 'kg' },
  ]);

  // Price history: k-1 carries a real series, k-2 a single point, k-3 none.
  await db.insert(schema.pricePoints).values([
    { id: 'p-1', skuId: 'k-1', price: 300_000, unit: 'kg', priceBasis: 'kg' },
    { id: 'p-2', skuId: 'k-1', price: 310_000, unit: 'kg', priceBasis: 'kg' },
    { id: 'p-3', skuId: 'k-1', price: 320_000, unit: 'kg', priceBasis: 'kg' },
    { id: 'p-4', skuId: 'k-2', price: 400_000, unit: 'kg', priceBasis: 'kg' },
  ]);
  // Only k-1 is actually published.
  await db.insert(schema.currentPrices).values([
    { skuId: 'k-1', price: 320_000, unit: 'kg', priceBasis: 'kg' },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('what a delete would destroy, counted on the server', () => {
  it('counts a product’s price history as rows, not as a yes/no', async () => {
    const one = await skuImpact('k-1');
    expect(one.skus).toBe(1);
    expect(one.pricePoints).toBe(3);
    expect(one.pricedSkus).toBe(1);

    // The distinction the old `hasPrice` boolean could not draw: both of these
    // products "have a price", and only one of them has a chart behind it.
    const two = await skuImpact('k-2');
    expect(two.pricePoints).toBe(1);
    expect(two.pricedSkus).toBe(0);
  });

  it('rolls a sub-category up to its products and their history', async () => {
    const sub = await subCategoryImpact('s-deformed');
    expect(sub.skus).toBe(2);
    expect(sub.pricePoints).toBe(4); // 3 for k-1 + 1 for k-2
    expect(sub.pricedSkus).toBe(1);
    // A sub-category has none of its own to take.
    expect(sub.subCategories).toBe(0);
  });

  it('rolls a category up through every sub-category under it', async () => {
    const cat = await categoryImpact('c-rebar');
    expect(cat.subCategories).toBe(2);
    expect(cat.skus).toBe(3);
    expect(cat.pricePoints).toBe(4);
  });

  it('reports honest zeroes for a genuinely empty category', async () => {
    const empty = await categoryImpact('c-empty');
    expect(empty.subCategories).toBe(0);
    expect(empty.skus).toBe(0);
    expect(empty.pricePoints).toBe(0);
  });

  it('sees a product filed since the panel last fetched its counts', async () => {
    // The whole reason this moved to the server. The browser's
    // `category.skuCount` is a snapshot; anything filed under the category
    // afterwards — by another admin, by the sync, by a script — was invisible
    // to the sentence the admin agreed to.
    const before = await categoryImpact('c-rebar');
    await db.insert(schema.skus).values({
      id: 'k-4',
      subCategoryId: 's-plain',
      categoryId: 'c-rebar',
      slug: 'k-4',
      name: 'میلگرد ساده ۱۴',
      unit: 'kg',
    });
    const after = await categoryImpact('c-rebar');
    expect(after.skus).toBe(before.skus + 1);
  });
});
