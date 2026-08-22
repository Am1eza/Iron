// @vitest-environment node
/**
 * پروفیل's «کارخانه» was fabricated, and the fix has to hold at the DTO
 * boundary — not in one component.
 *
 * ahanonline, the reference these pages are benchmarked against, has no
 * per-brand factory column on پروفیل at all: it groups by city and uses «محل
 * تحویل: کارخانه» as a delivery term. The mill names this catalog carried for
 * those sub-categories («نیکان پروفیل», «کیان پرشیا», …) matched nothing in
 * that data, so the owner asked for the distinction removed.
 *
 * Removing it in `PriceTable` alone would have left the value leaking out of
 * every other surface fed by the same DTO — the «بر اساس کارخانه» facet rail,
 * the per-factory landing pages it links to, `sitemap.xml`, the CSV export,
 * the AI advisor's grounding. `toPriceRow` is the one place they all read
 * through, so this asserts the suppression there and, in the same breath,
 * that «پروفیل ساختمانی» — the one sub the owner KEPT — is untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from './catalogRepo';
import { factoryFacets } from '@/lib/utils/catalogFacets';

let db: Db;
let close: () => Promise<void>;

/**
 * The six sub-categories the owner stripped, plus the one they did not.
 *
 * `factory` values are real ones from the live catalog, picked so both halves
 * of the reconstruction are covered: three embed a city the DTO must recover
 * into `region`, three embed none and must stay unresolved rather than be
 * guessed at.
 */
const SUBS = [
  { slug: 'prvfyl-snaty', name: 'پروفیل صنعتی', factory: 'صنعتی اصفهان', factoryGone: true, region: 'اصفهان' },
  { slug: 'profil-mobli', name: 'پروفیل مبلی', factory: 'نیکان پروفیل', factoryGone: true, region: undefined },
  { slug: 'profil-sotuni', name: 'پروفیل ستونی', factory: 'فولاد مشهد', factoryGone: true, region: 'مشهد' },
  { slug: 'profil-galvanizeh', name: 'پروفیل گالوانیزه', factory: 'کیان پرشیا', factoryGone: true, region: undefined },
  { slug: 'profil-z', name: 'پروفیل Z', factory: 'تهران شرق', factoryGone: true, region: 'تهران' },
  { slug: 'prvfyl-astyl', name: 'پروفیل استیل', factory: 'جهان پروفیل پارس', factoryGone: true, region: undefined },
  { slug: 'prvfyl-sakhtmany', name: 'پروفیل ساختمانی', factory: 'نیکان پروفیل', factoryGone: false, region: undefined },
];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-profile', slug: 'profile', name: 'پروفیل', order: 1, iconId: '', isActive: true },
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 2, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    ...SUBS.map((s, i) => ({
      id: `sub-${s.slug}`,
      categoryId: 'c-profile',
      slug: s.slug,
      name: s.name,
      order: i + 1,
      isActive: true,
    })),
    { id: 'sub-plain', categoryId: 'c-rebar', slug: 'plain', name: 'ساده', order: 1, isActive: true },
  ]);
  await db.insert(schema.skus).values([
    ...SUBS.map((s) => ({
      id: `sku-${s.slug}`,
      subCategoryId: `sub-${s.slug}`,
      categoryId: 'c-profile',
      slug: `sku-${s.slug}`,
      name: `${s.name} ۶۰×۶۰`,
      size: '۶۰×۶۰',
      factory: s.factory,
      unit: 'kg' as const,
      isActive: true,
    })),
    {
      id: 'sku-rebar',
      subCategoryId: 'sub-plain',
      categoryId: 'c-rebar',
      slug: 'sku-rebar',
      name: 'میلگرد ساده ۱۲',
      size: '۱۲',
      factory: 'نیکان پروفیل',
      unit: 'kg' as const,
      isActive: true,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('toPriceRow — the fabricated پروفیل factory', () => {
  it('withholds it on the six stripped sub-categories', async () => {
    const rows = await tableRows('profile');
    const by = new Map(rows.map((r) => [r.subCategoryId, r]));
    for (const s of SUBS.filter((x) => x.factoryGone)) {
      expect(by.get(s.slug)?.factory, s.slug).toBeUndefined();
    }
  });

  it('leaves «پروفیل ساختمانی» exactly as it was', async () => {
    const rows = await tableRows('profile', 'prvfyl-sakhtmany');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.factory).toBe('نیکان پروفیل');
  });

  it('does not touch the same mill name in another category', async () => {
    // The suppression is keyed on category+sub, not on the string: «نیکان
    // پروفیل» in میلگرد would be a real supplier and must survive.
    const rows = await tableRows('rebar');
    expect(rows[0]!.factory).toBe('نیکان پروفیل');
  });

  it('replaces it with the producing city, where the name embeds one', async () => {
    // The structural half of "make it like ahanonline": that site groups
    // پروفیل by city, and this is the only regional signal the catalog holds.
    // Derived at the SAME boundary as the suppression, so the table's region
    // sections and every other `PriceRow` consumer read one consistent story.
    const rows = await tableRows('profile');
    const by = new Map(rows.map((r) => [r.subCategoryId, r]));
    for (const s of SUBS.filter((x) => x.factoryGone)) {
      expect(by.get(s.slug)?.region, s.slug).toBe(s.region);
    }
  });

  it('never carries both a mill and a region on one row', async () => {
    // They are alternatives: the region exists only as a stand-in for a name
    // that was withheld, so a row publishing both would be claiming the
    // withheld distinction back under a second heading.
    for (const r of await tableRows('profile')) {
      expect(Boolean(r.factory && r.region), r.subCategoryId).toBe(false);
    }
    // ساختمانی in particular: it KEEPS its mill, so it gets no region even
    // though «نیکان پروفیل» would resolve to nothing anyway.
    const [sakhtmani] = await tableRows('profile', 'prvfyl-sakhtmany');
    expect(sakhtmani!.region).toBeUndefined();
  });

  it('derives no region for a category that kept its factories', async () => {
    expect((await tableRows('rebar'))[0]!.region).toBeUndefined();
  });

  it('keeps the withheld names out of the «بر اساس کارخانه» facets', async () => {
    // …which is what stops the facet rail linking, and `sitemap.xml`
    // advertising, a `/prices/profile/factory/nykan-prvfyl` page built on a
    // distinction the price page no longer makes.
    const profile = factoryFacets(await tableRows('profile'));
    // Only ساختمانی's mill is left — the other six subs seeded six DIFFERENT
    // real mill names, and not one of them reaches a facet.
    expect(profile.map((f) => f.label)).toEqual(['نیکان پروفیل']);
    expect(profile[0]!.count).toBe(1);

    expect(factoryFacets(await tableRows('rebar')).map((f) => f.label)).toEqual(['نیکان پروفیل']);
  });
});
