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

  it('a non-kg row (e.g. per-sheet) contributes its raw price directly — price is per kg regardless of unit', () => {
    // `current.price` is ALREADY per-kg for every SKU no matter its `unit` —
    // `unit` only says what a customer's qty counts in (kg mass vs. whole
    // sheets/branches/meters), never what the price is denominated in (see
    // PriceTable's «تومان / کیلوگرم» label, CostCalculator, and
    // leads.service.ts's priceItems). A prior version of this function
    // divided a non-kg row's price by theoreticalWeightKg, which was wrong
    // in the opposite direction — it would have shrunk a real per-kg price
    // by the weight factor for no reason.
    const rows = [row({ factory: 'Sheet Co', price: 100_000, unit: 'sheet', theoreticalWeightKg: 2.1 })];
    const split = computeBulkSplit(rows, 1);
    expect(split.cheapest?.pricePerKg).toBe(100_000);
  });

  it('includes a non-kg row even with no theoreticalWeightKg on file — no conversion is needed', () => {
    const rows = [
      row({ factory: 'Sheet Co', price: 210_000, unit: 'sheet', theoreticalWeightKg: undefined }),
      row({ factory: 'Kg Co', price: 100_000, unit: 'kg' }),
    ];
    const split = computeBulkSplit(rows, 1);
    expect(split.lines.map((l) => l.factory).sort()).toEqual(['Kg Co', 'Sheet Co']);
  });

  it('a mixed-unit factory (kg row + sheet row) averages both raw prices — both are already per-kg', () => {
    const rows = [
      row({ factory: 'Mixed', price: 90_000, unit: 'kg' }),
      row({ factory: 'Mixed', price: 110_000, unit: 'sheet', theoreticalWeightKg: 2.1 }),
    ];
    const split = computeBulkSplit(rows, 1);
    expect(split.cheapest?.pricePerKg).toBe(100_000); // (90,000 + 110,000) / 2
  });

  it('still excludes a hidden/stale price (stored as 0) — the W23 fix stays intact', () => {
    const rows = [
      row({ factory: 'A', price: 0, unit: 'kg', current: { skuId: 'sku', price: 0, unit: 'kg', priceBasis: 'kg', deliveryTime: '', vatIncluded: false, movementDir: 'flat', updatedAt: new Date().toISOString(), isStale: true, priceHidden: true } }),
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
    const hiddenCurrent = { skuId: 'sku', price: 0, unit: 'kg' as const, priceBasis: 'kg' as const, deliveryTime: '', vatIncluded: false, movementDir: 'flat' as const, updatedAt: new Date().toISOString(), isStale: true, priceHidden: true };
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


describe('price basis gating (W25 audit)', () => {
  /** Builds a row whose stored price is denominated in `basis`. */
  const basisRow = (factory: string, price: number, basis: PriceRow['priceBasis']) => {
    const r = row({ factory, price, unit: 'kg' });
    return { ...r, priceBasis: basis, current: { ...r.current, priceBasis: basis } } as PriceRow;
  };

  it('excludes non-kg rows from the comparison and counts them', () => {
    const rows = [
      basisRow('A', 100, 'kg'),
      // A per-قطعه وال‌پست price: multiplying this by tonnage×1000 would
      // quote a number with no relationship to the product.
      basisRow('B', 16_492_380, 'piece'),
    ];
    const split = computeBulkSplit(rows, 10);
    expect(split.lines.map((l) => l.factory)).toEqual(['A']);
    expect(split.excludedNonKg).toBe(1);
    expect(split.lines.some((l) => l.pricePerKg === 16_492_380)).toBe(false);
  });

  it('produces no comparison at all when every row is non-kg', () => {
    const rows = [basisRow('A', 500_000, 'coil'), basisRow('B', 600_000, 'sheet')];
    const split = computeBulkSplit(rows, 20);
    expect(split.lines).toEqual([]);
    expect(split.cheapest).toBeNull();
    expect(split.excludedNonKg).toBe(2);
  });

  it('treats a missing basis as kg (the column default)', () => {
    const split = computeBulkSplit([row({ factory: 'A', price: 100, unit: 'kg' })], 1);
    expect(split.lines).toHaveLength(1);
    expect(split.excludedNonKg).toBe(0);
  });

  it('does not count a withheld price as a non-kg exclusion', () => {
    const r = row({ factory: 'A', price: 0, unit: 'kg' });
    const hidden = { ...r, current: { ...r.current, priceHidden: true } } as PriceRow;
    const split = computeBulkSplit([hidden], 1);
    expect(split.lines).toEqual([]);
    expect(split.excludedNonKg).toBe(0);
  });

  it('pickBestGroup ignores sub-categories that are only non-kg priced', () => {
    const rows = [
      // Three mills quote the non-kg group, only two the kg group - without
      // the basis filter the non-kg group would win and open an empty panel.
      { ...basisRow('A', 1, 'piece'), subCategoryId: 'val-post' } as PriceRow,
      { ...basisRow('B', 2, 'piece'), subCategoryId: 'val-post' } as PriceRow,
      { ...basisRow('C', 3, 'piece'), subCategoryId: 'val-post' } as PriceRow,
      { ...basisRow('A', 100, 'kg'), subCategoryId: 'nabshi' } as PriceRow,
      { ...basisRow('B', 110, 'kg'), subCategoryId: 'nabshi' } as PriceRow,
    ];
    expect(pickBestGroup(rows)?.subCategoryId).toBe('nabshi');
  });
});
