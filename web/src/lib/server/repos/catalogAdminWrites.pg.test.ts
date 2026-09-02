// @vitest-environment node
/**
 * The catalog write paths that had no test at all, and each of which fails in
 * a way the admin is told nothing about.
 *
 * Every case here was live on `961bb34`:
 *
 *  · `unit`/`priceBasis` were published to `current_prices` by two UPDATEs
 *    fired after the SKU update, outside any transaction — and `toPriceRow`
 *    PREFERS `current_prices`, so losing the second statement quotes a real
 *    price against the wrong denomination on the public page;
 *  · moving a sub-category between categories re-parented its products with a
 *    second independent UPDATE, so a dropped connection between the two left
 *    products permanently orphaned under a breadcrumb that 404s — the comment
 *    above it promised the opposite;
 *  · a double-clicked save made a SECOND product with a `-2` slug and reported
 *    success both times;
 *  · a move did not re-sanitize `crossListedCategoryIds`, so a product could
 *    end up cross-listed into its own home category and render twice;
 *  · `order` ties (create defaults every node to 99) had no tie-break, so the
 *    published order of the nav was whatever the query plan felt like.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  DuplicateProductError,
  adminListCategories,
  catalogSuggestions,
  createSku,
  reorderTaxonomy,
  updateSku,
  updateSubCategory,
} from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 99, iconId: '' },
    { id: 'c-sheet', slug: 'sheet', name: 'ورق', order: 99, iconId: '' },
    { id: 'c-steel', slug: 'steel', name: 'استیل', order: 99, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-deformed', categoryId: 'c-rebar', slug: 'deformed', name: 'آجدار', order: 1 },
    { id: 's-hot', categoryId: 'c-sheet', slug: 'hot', name: 'گرم', order: 1 },
    { id: 's-steel-sheet', categoryId: 'c-steel', slug: 'steel-sheet', name: 'ورق استیل', order: 1 },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('createSku — a repeated submission is not a second product', () => {
  it('refuses the same name/size/factory under the same sub-category', async () => {
    const first = await createSku({
      subCategoryId: 's-deformed',
      slug: 'milgerd-14-a3',
      name: 'میلگرد ۱۴ A3',
      size: '۱۴',
      factory: 'نیشابور',
    });
    // The second click, or the retry of a request whose response was lost.
    await expect(
      createSku({
        subCategoryId: 's-deformed',
        slug: 'milgerd-14-a3',
        name: 'میلگرد ۱۴ A3',
        size: '۱۴',
        factory: 'نیشابور',
      }),
    ).rejects.toBeInstanceOf(DuplicateProductError);
    // And crucially: no `…-2` row was created behind the refusal.
    const rows = await db.select().from(schema.skus).where(eq(schema.skus.subCategoryId, 's-deformed'));
    expect(rows.map((r) => r.id)).toEqual([first.id]);
  });

  it('still allows a genuinely different product in the same sub-category', async () => {
    const other = await createSku({
      subCategoryId: 's-deformed',
      slug: 'milgerd-16-a3',
      name: 'میلگرد ۱۴ A3',
      size: '۱۶',
      factory: 'نیشابور',
    });
    expect(other.size).toBe('۱۶');
  });

  it('and the same product under a DIFFERENT sub-category, which is a different product', async () => {
    const elsewhere = await createSku({
      subCategoryId: 's-hot',
      slug: 'milgerd-14-a3',
      name: 'میلگرد ۱۴ A3',
      size: '۱۴',
      factory: 'نیشابور',
    });
    // freeSlug still settles the globally-unique slug silently — that part was
    // never the bug.
    expect(elsewhere.slug).toBe('milgerd-14-a3-2');
  });

  it('treats a missing factory as part of the identity, not as a wildcard', async () => {
    await createSku({ subCategoryId: 's-hot', slug: 'varagh-2', name: 'ورق ۲', size: '۲' });
    await expect(
      createSku({ subCategoryId: 's-hot', slug: 'varagh-2-again', name: 'ورق ۲', size: '۲' }),
    ).rejects.toBeInstanceOf(DuplicateProductError);
  });
});

describe('updateSku — the price row moves with the product', () => {
  it('publishes unit and priceBasis to current_prices in the same transaction', async () => {
    const sku = await createSku({
      subCategoryId: 's-hot',
      slug: 'varagh-basis',
      name: 'ورق مبنا',
      unit: 'kg',
      priceBasis: 'kg',
    });
    await db.insert(schema.currentPrices).values({ skuId: sku.id, price: 500_000, unit: 'kg', priceBasis: 'kg' });

    await updateSku(sku.id, { unit: 'branch', priceBasis: 'coil' });

    const price = await db
      .select()
      .from(schema.currentPrices)
      .where(eq(schema.currentPrices.skuId, sku.id))
      .limit(1);
    // `toPriceRow` prefers these over the SKU's own columns, so this is what
    // the public page actually captions the number with.
    expect(price[0]).toMatchObject({ unit: 'branch', priceBasis: 'coil' });
  });

  it('leaves the price row alone when neither column was touched', async () => {
    const sku = await createSku({ subCategoryId: 's-hot', slug: 'varagh-untouched', name: 'ورق دست‌نخورده' });
    await db.insert(schema.currentPrices).values({ skuId: sku.id, price: 1, unit: 'kg', priceBasis: 'kg' });
    await updateSku(sku.id, { name: 'ورق دست‌نخورده ۲' });
    const price = await db
      .select()
      .from(schema.currentPrices)
      .where(eq(schema.currentPrices.skuId, sku.id))
      .limit(1);
    expect(price[0]).toMatchObject({ unit: 'kg', priceBasis: 'kg' });
  });
});

describe('updateSku — moving a product re-checks its cross-listings', () => {
  it('drops a cross-listing that the move turned into the home category', async () => {
    const sku = await createSku({
      subCategoryId: 's-hot',
      slug: 'varagh-cross',
      name: 'ورق کراس',
      crossListedCategoryIds: ['c-steel'],
    });
    expect(sku.crossListedCategoryIds).toEqual(['c-steel']);

    // The admin moves it into استیل and sends ONLY the new sub-category — the
    // cross-list checkbox is not part of this save.
    const moved = await updateSku(sku.id, { subCategoryId: 's-steel-sheet' });

    expect(moved?.after.categoryId).toBe('c-steel');
    // Without the re-sanitize this stayed ['c-steel'], i.e.
    // `categoryId === crossListedCategoryIds[0]`, and the استیل page rendered
    // the product twice.
    expect(moved?.after.crossListedCategoryIds).toBeNull();
  });
});

describe('updateSubCategory — a move takes its products with it, atomically', () => {
  it('re-parents every product of the sub-category', async () => {
    await createSku({ subCategoryId: 's-deformed', slug: 'milgerd-move-1', name: 'میلگرد جابه‌جا ۱' });
    await createSku({ subCategoryId: 's-deformed', slug: 'milgerd-move-2', name: 'میلگرد جابه‌جا ۲' });

    const result = await updateSubCategory('s-deformed', { categoryId: 'c-sheet' });
    expect(result?.after.categoryId).toBe('c-sheet');

    const products = await db
      .select({ id: schema.skus.id, categoryId: schema.skus.categoryId })
      .from(schema.skus)
      .where(eq(schema.skus.subCategoryId, 's-deformed'));
    expect(products.length).toBeGreaterThan(0);
    // Not one row left behind: `skus.categoryId` disagreeing with its sub's is
    // a live product page under a breadcrumb that 404s.
    expect(products.every((p) => p.categoryId === 'c-sheet')).toBe(true);
  });

  it('refuses a destination category that does not exist, without moving anything', async () => {
    await expect(updateSubCategory('s-hot', { categoryId: 'c-nope' })).rejects.toThrow();
    const sub = await db
      .select()
      .from(schema.subCategories)
      .where(eq(schema.subCategories.id, 's-hot'))
      .limit(1);
    expect(sub[0]?.categoryId).toBe('c-sheet');
  });
});

describe('taxonomy order', () => {
  it('breaks ties deterministically instead of leaving them to the query plan', async () => {
    // All three seeded categories share order 99 — the create default, so this
    // is the normal state of a real catalog, not a contrived one.
    const once = await adminListCategories();
    const twice = await adminListCategories();
    expect(once.map((c) => c.id)).toEqual(twice.map((c) => c.id));
    expect(once.map((c) => c.id)).toEqual(['c-rebar', 'c-sheet', 'c-steel']);
  });

  it('applies a whole reorder in one transaction and reports what it replaced', async () => {
    const result = await reorderTaxonomy('category', [
      { id: 'c-steel', order: 1 },
      { id: 'c-sheet', order: 2 },
      { id: 'c-rebar', order: 3 },
    ]);
    expect(result.after).toHaveLength(3);
    // The "before" side is what makes a bad drag undoable from the audit log.
    expect(result.before.every((r) => r.order === 99)).toBe(true);
    expect((await adminListCategories()).map((c) => c.id)).toEqual(['c-steel', 'c-sheet', 'c-rebar']);
  });

  it('skips an id from a stale snapshot rather than failing the whole drag', async () => {
    const result = await reorderTaxonomy('category', [
      { id: 'c-rebar', order: 1 },
      { id: 'c-deleted-by-someone-else', order: 2 },
    ]);
    expect(result.after.map((r) => r.id)).toEqual(['c-rebar']);
  });

  it('will not let one category renumber another category sub-categories', async () => {
    const result = await reorderTaxonomy('subCategory', [{ id: 's-hot', order: 7 }], 'c-steel');
    expect(result.after).toHaveLength(0);
    const sub = await db
      .select()
      .from(schema.subCategories)
      .where(eq(schema.subCategories.id, 's-hot'))
      .limit(1);
    expect(sub[0]?.order).toBe(1);
  });
});

/**
 * The drawer's pickers, which used to select seven columns of EVERY row with
 * no LIMIT and no DISTINCT and de-duplicate them in Node — on every open, and
 * unscoped in the "all products" view. These pin the contract that survived
 * moving the DISTINCT into Postgres.
 */
describe('catalogSuggestions', () => {
  it('returns each value once, scoped to the category, sorted', async () => {
    await db.insert(schema.categories).values({ id: 'c-sugg', slug: 'sugg', name: 'پیشنهاد', order: 5, iconId: '' });
    await db
      .insert(schema.subCategories)
      .values({ id: 's-sugg', categoryId: 'c-sugg', slug: 'sugg-sub', name: 'زیرِ پیشنهاد', order: 1 });
    await db.insert(schema.skus).values([
      {
        id: 'sugg-1',
        slug: 'sugg-1',
        subCategoryId: 's-sugg',
        categoryId: 'c-sugg',
        name: 'الف',
        unit: 'kg' as const,
        factory: 'نیشابور',
        size: '۱۴',
        standard: 'ISIRI 3132',
      },
      {
        // The same factory again — one value in the picker, not two.
        id: 'sugg-2',
        slug: 'sugg-2',
        subCategoryId: 's-sugg',
        categoryId: 'c-sugg',
        name: 'ب',
        unit: 'kg' as const,
        factory: 'نیشابور',
        size: '۱۶',
        // Blank and null must not become pickable options.
        grade: '   ',
        standard: null,
      },
    ]);

    const s = await catalogSuggestions('c-sugg');
    expect(s.factories).toEqual(['نیشابور']);
    expect(s.sizes).toEqual(['۱۴', '۱۶']);
    expect(s.standards).toEqual(['ISIRI 3132']);
    // A whitespace-only column is not a suggestion, and neither is NULL.
    expect(s.grades).toEqual([]);
    expect(s.conditions).toEqual([]);
    // Scoped: the products seeded under the other categories are not here.
    expect(s.factories).not.toContain('ذوب آهن');
  });

  it('answers a category with no products with empty lists, never null', async () => {
    // Every aggregate is NULL when no row matches — a brand new category must
    // still open a drawer with empty pickers rather than crashing on `.map`.
    await db.insert(schema.categories).values({ id: 'c-empty', slug: 'empty', name: 'خالی', order: 6, iconId: '' });
    const s = await catalogSuggestions('c-empty');
    expect(s).toMatchObject({
      factories: [],
      sizes: [],
      grades: [],
      conditions: [],
      dimensions: [],
      schedules: [],
      standards: [],
      groupLabels: [],
    });
  });
});
