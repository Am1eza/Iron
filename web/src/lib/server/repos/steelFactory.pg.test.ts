// @vitest-environment node
/**
 * استیل is imported, so its «کارخانه» was never a mill — and the removal has
 * to hold at the DTO boundary, not in one component.
 *
 * What the column actually held: «چین» on every نبشی row and «تایوان» on
 * every ناودانی row — a country of ORIGIN — and nothing at all on لوله and
 * پروفیل. The page was nevertheless publishing a «کارخانه» column, per-factory
 * sections and a «۱ کارخانه» stat on top of it, which is what the owner's
 * employer asked to have removed (1405/06).
 *
 * Two things are asserted here that a component test cannot reach: that
 * `toPriceRow` withholds the value for EVERY sub (استیل, unlike پروفیل, has
 * no exception), and that `publicCatalogPaths` therefore stops advertising
 * `/prices/steel/factory/chyn` — a URL whose page resolves its own segment
 * against these same withheld rows and would `notFound()`, so leaving it in
 * the sitemap and in `knownPaths` would publish a guaranteed 404.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows, publicCatalogPaths } from './catalogRepo';
import { factoryFacets } from '@/lib/utils/catalogFacets';

let db: Db;
let close: () => Promise<void>;

/** The four subs that hold live stock, with their real stored origins. */
const SUBS = [
  { slug: 'angle', name: 'نبشی استیل', factory: 'چین', grade: '304' },
  { slug: 'channel', name: 'ناودانی استیل', factory: 'تایوان', grade: '304L' },
  { slug: 'pipe', name: 'لوله استیل', factory: null, grade: '316L' },
  { slug: 'profile', name: 'پروفیل استیل', factory: null, grade: '201' },
];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-steel', slug: 'steel', name: 'استیل', order: 1, iconId: '', isActive: true },
    { id: 'c-angle-channel', slug: 'angle-channel', name: 'نبشی و ناودانی', order: 2, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    ...SUBS.map((s, i) => ({
      id: `sub-${s.slug}`,
      categoryId: 'c-steel',
      slug: s.slug,
      name: s.name,
      order: i + 1,
      isActive: true,
    })),
    // A same-named sub under a DIFFERENT category, whose mill is real.
    { id: 'sub-carbon-angle', categoryId: 'c-angle-channel', slug: 'angle', name: 'نبشی', order: 1, isActive: true },
  ]);
  await db.insert(schema.skus).values([
    ...SUBS.map((s) => ({
      id: `sku-${s.slug}`,
      subCategoryId: `sub-${s.slug}`,
      categoryId: 'c-steel',
      slug: `sku-${s.slug}`,
      name: `${s.name} ۴۰×۴۰`,
      size: '۴۰×۴۰',
      grade: s.grade,
      factory: s.factory,
      branchLengthM: 6,
      unit: 'kg' as const,
      isActive: true,
    })),
    {
      id: 'sku-carbon-angle',
      subCategoryId: 'sub-carbon-angle',
      categoryId: 'c-angle-channel',
      slug: 'sku-carbon-angle',
      name: 'نبشی ۴۰×۴۰',
      size: '۴۰×۴۰',
      factory: 'ناب تبریز',
      unit: 'kg' as const,
      isActive: true,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('toPriceRow — استیل publishes no factory at all', () => {
  it('withholds it on every sub, including the ones storing a country', async () => {
    const by = new Map((await tableRows('steel')).map((r) => [r.subCategoryId, r]));
    for (const s of SUBS) expect(by.get(s.slug)?.factory, s.slug).toBeUndefined();
  });

  it('derives no «محل تولید» stand-in either — a country is not a city', async () => {
    // The پروفیل half of this rule recovers an Iranian producing city out of a
    // fabricated mill name. «چین»/«تایوان» are neither, so استیل rows carry
    // nothing in its place and the table falls back to one flat list.
    for (const r of await tableRows('steel')) {
      expect(r.region, r.subCategoryId).toBeUndefined();
    }
  });

  it('keeps the branch length, which is what replaced the column', async () => {
    for (const r of await tableRows('steel')) expect(r.branchLengthM, r.subCategoryId).toBe(6);
  });

  it('does not touch a same-named sub in another category', async () => {
    // The suppression is keyed on the CATEGORY: «نبشی» under نبشی و ناودانی is
    // domestic and its mill is real.
    const rows = await tableRows('angle-channel');
    expect(rows[0]!.factory).toBe('ناب تبریز');
  });

  it('leaves the «بر اساس کارخانه» facets empty for استیل only', async () => {
    expect(factoryFacets(await tableRows('steel'))).toEqual([]);
    expect(factoryFacets(await tableRows('angle-channel')).map((f) => f.label)).toEqual(['ناب تبریز']);
  });

  it('stops publishing a /factory/ landing URL استیل can no longer render', async () => {
    const paths = await publicCatalogPaths();
    expect(paths.filter((p) => p.startsWith('/prices/steel/factory/'))).toEqual([]);
    // …while the category that kept its mills still advertises its own.
    expect(paths.some((p) => p.startsWith('/prices/angle-channel/factory/'))).toBe(true);
    // The size facets are untouched by any of this.
    expect(paths).toContain('/prices/steel');
    expect(paths.some((p) => p.startsWith('/prices/steel/size/'))).toBe(true);
  });
});
