import { describe, it, expect } from 'vitest';
import { computeBulkSplit, pickBestGroup } from './bulkSplit';
import type { PriceRow } from '@/lib/types/domain';

function row(overrides: Partial<PriceRow> & { factory: string; price: number; unit: PriceRow['unit'] }): PriceRow {
  const { price, unit, factory, ...rest } = overrides;
  return {
    id: `${factory}-${Math.random()}`,
    subCategoryId: 'sub',
    categoryId: 'cat',
    slug: 'sku',
    name: 'sku',
    factory,
    unit,
    isActive: true,
    current: {
      skuId: 'sku',
      price,
      unit,
      deliveryTime: '',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date().toISOString(),
      isStale: false,
      priceHidden: false,
    },
    ...rest,
  } as PriceRow;
}

describe('computeBulkSplit', () => {
  it('averages plain per-kg rows normally', () => {
    const rows = [
      row({ factory: 'A', price: 100, unit: 'kg' }),
      row({ factory: 'A', price: 200, unit: 'kg' }),
      row({ factory: 'B', price: 300, unit: 'kg' }),
    ];
    const split = computeBulkSplit(rows, 10);
    const a = split.lines.find((l) => l.factory === 'A')!;
    const b = split.lines.find((l) => l.factory === 'B')!;
    expect(a.pricePerKg).toBe(150);
    expect(b.pricePerKg).toBe(300);
    expect(split.cheapest?.factory).toBe('A');
  });

  it('normalizes a non-kg row (e.g. per-sheet) by theoreticalWeightKg before averaging', () => {
    // Real production shape: a sheet-unit SKU priced 210,000 Toman/sheet at
    // 2.1kg/sheet — the true per-kg price is 210000/2.1 = 100,000. Before the
    // fix this raw 210,000 got averaged in as if it were already per-kg,
    // making the factory look ~2,100x too expensive (or, mixed with other
    // rows, silently wrong either direction).
    const rows = [row({ factory: 'Sheet Co', price: 210_000, unit: 'sheet', theoreticalWeightKg: 2.1 })];
    const split = computeBulkSplit(rows, 1);
    expect(split.cheapest?.pricePerKg).toBe(100_000);
  });

  it('excludes a non-kg row with no theoreticalWeightKg instead of treating its raw price as per-kg', () => {
    const rows = [
      row({ factory: 'Sheet Co', price: 210_000, unit: 'sheet', theoreticalWeightKg: undefined }),
      row({ factory: 'Kg Co', price: 100_000, unit: 'kg' }),
    ];
    const split = computeBulkSplit(rows, 1);
    expect(split.lines.map((l) => l.factory)).toEqual(['Kg Co']);
  });

  it('a mixed-unit factory (kg row + normalized sheet row) averages the two true per-kg prices, not the raw ones', () => {
    const rows = [
      row({ factory: 'Mixed', price: 90_000, unit: 'kg' }),
      row({ factory: 'Mixed', price: 210_000, unit: 'sheet', theoreticalWeightKg: 2.1 }), // → 100,000/kg
    ];
    const split = computeBulkSplit(rows, 1);
    expect(split.cheapest?.pricePerKg).toBe(95_000); // (90,000 + 100,000) / 2
  });

  it('still excludes a hidden/stale price (stored as 0) — the W23 fix stays intact', () => {
    const rows = [
      row({ factory: 'A', price: 0, unit: 'kg', current: { skuId: 'sku', price: 0, unit: 'kg', deliveryTime: '', vatIncluded: false, movementDir: 'flat', updatedAt: new Date().toISOString(), isStale: true, priceHidden: true } }),
      row({ factory: 'B', price: 200, unit: 'kg' }),
    ];
    const split = computeBulkSplit(rows, 1);
    expect(split.cheapest?.factory).toBe('B');
  });
});

describe('pickBestGroup', () => {
  it('picks the sub-category quoted by the most distinct factories', () => {
    const rows = [
      // 'rare': only one factory across all its sizes
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'rare', size: '12' }),
      // 'common': three different factories — the more useful, more
      // comparable group, even though each factory only quotes one size
      // (real catalog data confirmed this is the normal shape — see
      // aiToolsCompareFactories.test.ts — so grouping must NOT also require
      // an exact size match or it would collapse to one factory almost
      // every time).
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'common', size: '10' }),
      row({ factory: 'B', price: 110, unit: 'kg', subCategoryId: 'common', size: '14' }),
      row({ factory: 'C', price: 120, unit: 'kg', subCategoryId: 'common', size: '25' }),
    ];
    expect(pickBestGroup(rows)).toEqual({ subCategoryId: 'common' });
  });

  it('breaks a tie in factory count by row count', () => {
    const rows = [
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'x' }),
      row({ factory: 'B', price: 100, unit: 'kg', subCategoryId: 'x' }),
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'y', size: '20' }),
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'y', size: '22' }), // same factory, 2nd row
      row({ factory: 'B', price: 100, unit: 'kg', subCategoryId: 'y', size: '24' }),
    ];
    // Both groups have 2 distinct factories; 'y' has 3 rows vs 'x''s 2.
    expect(pickBestGroup(rows)).toEqual({ subCategoryId: 'y' });
  });

  it('ignores hidden/stale rows when scoring groups', () => {
    const hiddenCurrent = { skuId: 'sku', price: 0, unit: 'kg' as const, deliveryTime: '', vatIncluded: false, movementDir: 'flat' as const, updatedAt: new Date().toISOString(), isStale: true, priceHidden: true };
    const rows = [
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'x', current: hiddenCurrent }),
      row({ factory: 'B', price: 100, unit: 'kg', subCategoryId: 'x', current: hiddenCurrent }),
      row({ factory: 'A', price: 100, unit: 'kg', subCategoryId: 'y' }),
    ];
    expect(pickBestGroup(rows)).toEqual({ subCategoryId: 'y' });
  });

  it('returns null for empty input', () => {
    expect(pickBestGroup([])).toBeNull();
  });
});
