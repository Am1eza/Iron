import { describe, it, expect } from 'vitest';
import { orderBySizeRows, bestPriceRowId } from './PriceTable';
import type { PriceRow } from '@/lib/types/domain';

function row(overrides: Partial<PriceRow> & { id: string; price: number; hidden?: boolean }): PriceRow {
  const { price, hidden = false, ...rest } = overrides;
  return {
    subCategoryId: 'sub',
    categoryId: 'cat',
    slug: overrides.id,
    name: overrides.id,
    unit: 'kg',
    isActive: true,
    ...rest,
    current: {
      skuId: overrides.id,
      price,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date().toISOString(),
      isStale: false,
      priceHidden: hidden,
      ...rest.current,
    },
  } as PriceRow;
}

describe('orderBySizeRows — the by-size comparison ordering', () => {
  it('sorts visible (non-hidden) prices cheapest-first', () => {
    const rows = [
      row({ id: 'a', price: 300 }),
      row({ id: 'b', price: 100 }),
      row({ id: 'c', price: 200 }),
    ];
    expect(orderBySizeRows(rows).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('pushes every stale/hidden-price row to the end, regardless of its stored price value', () => {
    // The critical case: a stale row's stored price (10) is far BELOW every
    // real price — a naive price-ascending sort would put it first and let
    // it silently win "best price" even though the UI shows «تماس بگیرید»
    // for it, not the number 10.
    const rows = [
      row({ id: 'real-expensive', price: 500 }),
      row({ id: 'stale-cheap-looking', price: 10, hidden: true }),
      row({ id: 'real-cheap', price: 200 }),
    ];
    const ordered = orderBySizeRows(rows);
    expect(ordered.map((r) => r.id)).toEqual(['real-cheap', 'real-expensive', 'stale-cheap-looking']);
  });

  it('keeps multiple hidden rows in the tail without crashing or reordering them by price', () => {
    const rows = [
      row({ id: 'stale-1', price: 999, hidden: true }),
      row({ id: 'visible', price: 150 }),
      row({ id: 'stale-2', price: 1, hidden: true }),
    ];
    const ordered = orderBySizeRows(rows);
    expect(ordered[0]!.id).toBe('visible');
    expect(new Set(ordered.slice(1).map((r) => r.id))).toEqual(new Set(['stale-1', 'stale-2']));
  });
});

describe('bestPriceRowId — the "بهترین قیمت" badge target', () => {
  it('picks the cheapest visible row', () => {
    const ordered = orderBySizeRows([row({ id: 'a', price: 300 }), row({ id: 'b', price: 100 })]);
    expect(bestPriceRowId(ordered)).toBe('b');
  });

  it('returns undefined when every row for this size is stale/hidden — the pre-launch state today, and must not crash or badge a hidden row', () => {
    const ordered = orderBySizeRows([
      row({ id: 'a', price: 500, hidden: true }),
      row({ id: 'b', price: 10, hidden: true }),
    ]);
    expect(bestPriceRowId(ordered)).toBeUndefined();
  });

  it('returns undefined for an empty size selection', () => {
    expect(bestPriceRowId([])).toBeUndefined();
  });
});
