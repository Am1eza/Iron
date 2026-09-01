// @vitest-environment node
/**
 * The catalog has exactly two states now: a row is there, or it is gone.
 *
 * It used to have three. A half-finished taxonomy migration created new
 * sub-categories, deactivated the old ones, and never moved the products — so
 * 167 of 240 live products became unreachable on the public site (every read
 * filtered `is_active` at category, sub-category AND SKU) while the panel kept
 * showing each of them a green «فعال» badge. The panel then grew a whole
 * «نامرئی در سایت» apparatus to describe that gap.
 *
 * Dropping the flag is what closes it for good, and these tests hold that
 * shut: whatever the admin panel lists is exactly what the public site serves,
 * and deleting a parent takes its children with it instead of stranding them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListSkus, deleteCategory, deleteSubCategory, deleteSku } from './catalogAdminRepo';
import { tableRows } from './catalogRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-live', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' },
    { id: 'c-doomed', slug: 'sheet', name: 'ورق', order: 2, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-live', categoryId: 'c-live', slug: 'plain', name: 'ساده', order: 1 },
    { id: 's-doomed', categoryId: 'c-live', slug: 'deformed-a2', name: 'آجدار A2', order: 2 },
    { id: 's-under-doomed-cat', categoryId: 'c-doomed', slug: 'hot', name: 'گرم', order: 1 },
  ]);
  const sku = (id: string, subId: string, catId: string, name: string) => ({
    id,
    subCategoryId: subId,
    categoryId: catId,
    slug: id,
    name,
    unit: 'kg' as const,
  });
  await db.insert(schema.skus).values([
    sku('ok-1', 's-live', 'c-live', 'میلگرد ساده'),
    sku('ok-2', 's-live', 'c-live', 'میلگرد ساده ۱۲'),
    sku('under-doomed-sub', 's-doomed', 'c-live', 'میلگرد آجدار'),
    sku('under-doomed-cat', 's-under-doomed-cat', 'c-doomed', 'ورق گرم'),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('the panel and the public site list the same products', () => {
  it('shows every product, with no hidden-state columns left to disagree about', async () => {
    const { rows, total } = await adminListSkus({});
    expect(total).toBe(4);
    expect(rows.map((r) => r.sku.id).sort()).toEqual([
      'ok-1',
      'ok-2',
      'under-doomed-cat',
      'under-doomed-sub',
    ]);
  });

  it('serves the panel-listed products from the public read path too', async () => {
    const panel = await adminListSkus({ categoryId: 'c-live', subCategoryId: 's-live' });
    const site = await tableRows('rebar', 'plain', { forAdmin: true });
    expect(site.map((r) => r.id).sort()).toEqual(panel.rows.map((r) => r.sku.id).sort());
  });
});

describe('delete is a delete', () => {
  it('takes a product off both surfaces at once', async () => {
    expect(await deleteSku('ok-2')).toMatchObject({ id: 'ok-2' });

    const { rows } = await adminListSkus({ subCategoryId: 's-live' });
    expect(rows.map((r) => r.sku.id)).toEqual(['ok-1']);
    expect((await tableRows('rebar', 'plain', { forAdmin: true })).map((r) => r.id)).toEqual(['ok-1']);
  });

  it('removing a sub-category removes its products rather than stranding them, and snapshots them for restore', async () => {
    const result = await deleteSubCategory('s-doomed');
    expect(result?.removed).toMatchObject({ id: 's-doomed' });
    // The whole point of #5: the cascaded product is captured BEFORE it's
    // gone, not just the sub-category's own two columns.
    expect(result?.subtree.skus.map((s) => s.id)).toEqual(['under-doomed-sub']);
    expect(result?.subtree.pricePointsCount).toBe(0);

    const left = await db.select().from(schema.skus).where(eq(schema.skus.id, 'under-doomed-sub'));
    expect(left).toHaveLength(0);
    const { rows } = await adminListSkus({ categoryId: 'c-live' });
    expect(rows.map((r) => r.sku.id)).toEqual(['ok-1']);
  });

  it('removing a category takes its sub-categories and their products with it, and snapshots the whole subtree', async () => {
    const result = await deleteCategory('c-doomed');
    expect(result?.removed).toMatchObject({ id: 'c-doomed' });
    expect(result?.subtree.subCategories.map((s) => s.id)).toEqual(['s-under-doomed-cat']);
    expect(result?.subtree.skus.map((s) => s.id)).toEqual(['under-doomed-cat']);

    const subs = await db
      .select()
      .from(schema.subCategories)
      .where(eq(schema.subCategories.id, 's-under-doomed-cat'));
    expect(subs).toHaveLength(0);
    const { rows, total } = await adminListSkus({});
    expect(total).toBe(1);
    expect(rows.map((r) => r.sku.id)).toEqual(['ok-1']);
  });

  it('reports a miss instead of pretending, when the row is already gone', async () => {
    expect(await deleteSku('ok-2')).toBeNull();
    expect(await deleteSubCategory('s-doomed')).toBeNull();
    expect(await deleteCategory('c-doomed')).toBeNull();
  });
});
