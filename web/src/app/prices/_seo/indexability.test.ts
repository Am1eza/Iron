/**
 * The rule these tests pin is stated in full in `indexability.ts`. What is
 * pinned here is its ASYMMETRY, because that is the part a later reader is
 * most likely to "tidy up" into one uniform predicate:
 *
 *   · a zero-row taxonomy page is withheld (soft-404 — 17 of production's 85
 *     sub-categories were in this state, all 200, all indexed, all in the
 *     sitemap);
 *   · a price-less SKU page is NOT withheld (195 of 748 — thin but true, and
 *     the entry point of a lead-gen funnel).
 *
 * Collapsing those two into "hide anything without a price" would drop 26 %
 * of the catalog out of search on a flag that flips back as soon as an admin
 * types a number.
 */
import { describe, it, expect } from 'vitest';
import {
  rowsInSubCategory,
  skuHasPublishedPrice,
  skuIsIndexable,
  skuSitemapHints,
  taxonomyIsIndexable,
} from './indexability';

const row = (subCategoryId: string, priceHidden = false) => ({
  subCategoryId,
  current: { priceHidden },
});

describe('taxonomyIsIndexable', () => {
  it('withholds a zero-row taxonomy page', () => {
    expect(taxonomyIsIndexable(0)).toBe(false);
  });

  it('admits a taxonomy page the moment it holds one row', () => {
    // The boundary matters: this is what makes the fix self-healing. Adding
    // the first SKU to `/prices/steel/mesh` re-admits it on the next
    // revalidation with no deploy.
    expect(taxonomyIsIndexable(1)).toBe(true);
    expect(taxonomyIsIndexable(186)).toBe(true);
  });
});

describe('rowsInSubCategory', () => {
  it('is the sub-category page’s own row set, taken from the category’s', () => {
    const rows = [row('mesh'), row('flange'), row('flange')];

    expect(rowsInSubCategory(rows, 'flange')).toHaveLength(2);
    expect(rowsInSubCategory(rows, 'mesh')).toHaveLength(1);
  });

  it('reports zero for a sub-category no row belongs to', () => {
    // `/prices/steel/mesh` — the sub-category row exists in the taxonomy, so
    // the page renders 200; no SKU points at it, so there is no table.
    expect(rowsInSubCategory([row('flange')], 'mesh')).toEqual([]);
  });
});

describe('skuHasPublishedPrice', () => {
  it('is false when the price is withheld', () => {
    expect(skuHasPublishedPrice({ current: { priceHidden: true } })).toBe(false);
  });

  it('is true for a published price', () => {
    expect(skuHasPublishedPrice({ current: { priceHidden: false } })).toBe(true);
  });

  it('treats a row with no price information at all as priced, not as hidden', () => {
    // Defensive, and the direction matters: `priceHidden` is the explicit
    // "we are withholding this" signal from `toPriceRow`. A row that simply
    // never carried the field (a test fixture, a future DTO) must not be
    // silently demoted in the sitemap on the strength of an absent property.
    expect(skuHasPublishedPrice({})).toBe(true);
    expect(skuHasPublishedPrice({ current: {} })).toBe(true);
  });
});

describe('skuIsIndexable', () => {
  it('keeps every product page indexable, priced or not', () => {
    expect(skuIsIndexable()).toBe(true);
  });
});

describe('skuSitemapHints', () => {
  it('claims hourly change only for a page that has a price to change', () => {
    expect(skuSitemapHints(true).changeFrequency).toBe('hourly');
    expect(skuSitemapHints(false).changeFrequency).toBe('weekly');
  });

  it('ranks a priced page above a price-less one', () => {
    expect(skuSitemapHints(true).priority).toBeGreaterThan(skuSitemapHints(false).priority);
  });
});
