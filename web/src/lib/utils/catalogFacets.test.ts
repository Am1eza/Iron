import { describe, it, expect } from 'vitest';
import {
  factoryFacetSlug,
  sizeFacetSlug,
  factoryFacets,
  sizeFacets,
  collidingFacets,
} from './catalogFacets';
import { RESERVED_SUB_SLUGS, routes } from '@/lib/routes';
import { MOCK_CATEGORY_SUBS } from '@/lib/data/nav';

describe('sizeFacetSlug', () => {
  it('keeps the three لوله inch sizes apart — the collision plain slugify has', () => {
    // All three exist in the live catalog today and are priced separately.
    // `slugify` drops ¼/½ entirely, mapping every one of these to `1-aynch`.
    const slugs = ['۱ اینچ', '۱¼ اینچ', '۱½ اینچ', '۱/۲ اینچ', '۲½ اینچ', '۳/۴ اینچ'].map(sizeFacetSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[0]).toBe('1-aynch');
    expect(slugs[1]).toBe('1-1-4-aynch');
    expect(slugs[2]).toBe('1-1-2-aynch');
    expect(slugs[3]).toBe('1-2-aynch');
  });

  it('renders Persian digits as ASCII — the URL is the number a buyer searches', () => {
    expect(sizeFacetSlug('۱۴')).toBe('14');
    expect(sizeFacetSlug('۲.۵')).toBe('2-5');
    expect(sizeFacetSlug('۱۰۰×۱۰۰')).toBe('100-100');
  });
});

describe('factoryFacetSlug', () => {
  it('matches the transliteration the SKU slugs already use', () => {
    expect(factoryFacetSlug('کویر کاشان')).toBe('kvyr-kashan');
    expect(factoryFacetSlug('ذوب‌آهن اصفهان')).toBe('zvb-ahn-asfhan');
  });
});

const rows = [
  { factory: 'ابهر', size: '۱۴' },
  { factory: 'ابهر', size: '۱۰' },
  { factory: 'فایکو', size: '۱۴' },
  { factory: '  ', size: '' },
  { factory: null, size: undefined },
];

describe('factoryFacets / sizeFacets', () => {
  it('counts SKUs per facet and orders factories busiest-first', () => {
    const f = factoryFacets(rows);
    expect(f.map((x) => [x.slug, x.count])).toEqual([
      ['abhr', 2],
      ['faykv', 1],
    ]);
  });

  it('orders sizes numerically, not lexically — ۱۰ before ۱۴, never "10" after "14"', () => {
    expect(sizeFacets(rows).map((x) => x.slug)).toEqual(['10', '14']);
  });

  it('never emits a facet for a blank or slug-less value', () => {
    expect(factoryFacets(rows).some((x) => x.slug === '')).toBe(false);
    expect(sizeFacets([{ size: '—' }]).length).toBe(0);
  });

  it('carries every stored spelling that shares a slug, so the page matches all of them', () => {
    const f = factoryFacets([{ factory: 'ابهر' }, { factory: 'ابهر ' }, { factory: 'فایکو' }]);
    const abhr = f.find((x) => x.slug === 'abhr')!;
    expect(abhr.count).toBe(2);
    // Trimmed to the same string, so this is one value, not a collision.
    expect(collidingFacets(f)).toEqual([]);
  });
});

describe('facet route builders', () => {
  it('sit under a literal segment at SKU depth', () => {
    expect(routes.categoryByFactory('rebar', 'abhr')).toBe('/prices/rebar/factory/abhr');
    expect(routes.categoryBySize('rebar', '14')).toBe('/prices/rebar/size/14');
  });

  it('no known sub-category slug collides with a reserved literal segment', () => {
    // The live taxonomy is in the database, but the fixture mirrors its shape
    // and the API schema (`subCategorySlugSchema`) rejects these at write time,
    // so this asserts the fixture half of the same invariant.
    for (const subs of Object.values(MOCK_CATEGORY_SUBS)) {
      for (const sub of subs) {
        expect(RESERVED_SUB_SLUGS as readonly string[]).not.toContain(sub.slug);
      }
    }
  });
});
