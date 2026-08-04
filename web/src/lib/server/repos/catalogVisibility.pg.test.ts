// @vitest-environment node
/**
 * "Active" is a three-level property, and the catalog panel only ever
 * reported one level of it.
 *
 * A half-finished taxonomy migration created new sub-categories, deactivated
 * the old ones, and never moved the products — so 167 of 240 live products
 * became unreachable on the public site (every read filters `is_active` at
 * category, sub-category AND SKU) while the panel kept showing each of them a
 * green «فعال» badge. Nothing in either admin screen could express the
 * difference, so nothing ever raised it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListSkus } from './catalogAdminRepo';
import { countSkusHiddenByTaxonomy, tableRows } from './catalogRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-live', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '', isActive: true },
    { id: 'c-dead', slug: 'sheet', name: 'ورق', order: 2, iconId: '', isActive: false },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-live', categoryId: 'c-live', slug: 'plain', name: 'ساده', order: 1, isActive: true },
    { id: 's-dead', categoryId: 'c-live', slug: 'deformed-a2', name: 'آجدار A2', order: 2, isActive: false },
    { id: 's-under-dead-cat', categoryId: 'c-dead', slug: 'hot', name: 'گرم', order: 1, isActive: true },
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
    sku('ok-1', 's-live', 'c-live', 'میلگرد ساده'),
    sku('stranded-sub', 's-dead', 'c-live', 'میلگرد آجدار'),
    sku('stranded-cat', 's-under-dead-cat', 'c-dead', 'ورق گرم'),
    { ...sku('retired', 's-live', 'c-live', 'میلگرد بازنشسته'), isActive: false },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('adminListSkus — visibleOnSite', () => {
  it('separates "the flag is on" from "a customer can reach it"', async () => {
    const { rows } = await adminListSkus({ status: 'active' });
    const by = new Map(rows.map((r) => [r.sku.id, r]));
    expect(by.get('ok-1')!.visibleOnSite).toBe(true);
    expect(by.get('ok-1')!.hiddenReason).toBeNull();

    // Both of these have `skus.is_active = true` and are unreachable.
    expect(by.get('stranded-sub')!.visibleOnSite).toBe(false);
    expect(by.get('stranded-sub')!.hiddenReason).toBe('sub');
    expect(by.get('stranded-sub')!.subName).toBe('آجدار A2');

    expect(by.get('stranded-cat')!.visibleOnSite).toBe(false);
    expect(by.get('stranded-cat')!.hiddenReason).toBe('category');
  });

  it('reports the catalog-wide stranded count regardless of the active filter', async () => {
    // Scoped to one category, and the number still describes the CATALOG —
    // the admin has no reason to go filter-hunting for a problem nobody has
    // told them they have.
    const { hiddenTotal } = await adminListSkus({ categoryId: 'c-live', status: 'active' });
    expect(hiddenTotal).toBe(2);
  });

  it('lists exactly the stranded products when asked for them', async () => {
    const { rows, total } = await adminListSkus({ visibility: 'hidden', status: 'active' });
    expect(total).toBe(2);
    expect(rows.map((r) => r.sku.id).sort()).toEqual(['stranded-cat', 'stranded-sub']);
  });

  it('does not count a deliberately retired product as stranded', async () => {
    const { rows } = await adminListSkus({ visibility: 'hidden', includeInactive: true });
    expect(rows.map((r) => r.sku.id)).not.toContain('retired');
  });
});

describe('countSkusHiddenByTaxonomy — what the pricing grid explains its empty table with', () => {
  it('counts catalog-wide, and per category', async () => {
    expect(await countSkusHiddenByTaxonomy()).toBe(2);
    expect(await countSkusHiddenByTaxonomy('rebar')).toBe(1);
    expect(await countSkusHiddenByTaxonomy('sheet')).toBe(1);
  });

  it('matches what the pricing grid actually cannot show', async () => {
    // The grid reads tableRows(), which drops both stranded products — so the
    // count above is exactly the gap between "products in this category" and
    // "rows the operator can price".
    const rows = await tableRows('rebar', undefined, { forAdmin: true });
    expect(rows.map((r) => r.id)).toEqual(['ok-1']);
  });
});
