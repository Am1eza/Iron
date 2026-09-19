import { describe, it, expect } from 'vitest';
import type { PriceRow } from '@/lib/types/domain';
import { subSummaries, sizeSummaries } from './hubSummary';

function row(id: string, sub: string, size: string, factory: string | undefined, price: number, over: Partial<PriceRow['current']> = {}): PriceRow {
  return {
    id,
    subCategoryId: sub,
    categoryId: 'rebar',
    slug: id,
    name: id,
    size,
    factory,
    unit: 'kg',
    priceBasis: 'kg',
    current: { skuId: id, price, unit: 'kg', deliveryTime: '', vatIncluded: false, movementDir: 'flat', updatedAt: '2026-09-17T00:00:00Z', isStale: false, ...over },
  } as PriceRow;
}

const ROWS = [
  row('a', 'deformed', '۱۰', 'M1', 90_000),
  row('b', 'deformed', '۱۰', 'M2', 95_000),
  row('c', 'deformed', '۱۲', 'M1', 88_000),
  row('d', 'plain', '۱۰', undefined, 70_000),
  row('e', 'plain', '۱۴', 'M3', 999, { priceHidden: true }),
  row('f', 'coil', '۸', 'M3', 0),
];

describe('subSummaries', () => {
  it('summarises each sub-category over its confirmed prices, in the given order', () => {
    const s = subSummaries(ROWS, [{ slug: 'plain' }, { slug: 'deformed' }, { slug: 'coil' }, { slug: 'missing' }]);
    expect(s.map((x) => x.slug)).toEqual(['plain', 'deformed']);
    expect(s[1]).toMatchObject({ slug: 'deformed', count: 3, min: 88_000, max: 95_000, mills: 2, basis: 'kg' });
    expect(s[0]).toMatchObject({ count: 1, min: 70_000, max: 70_000, mills: 0 });
  });

  it('never lets a hidden or zero price into a range', () => {
    const s = subSummaries(ROWS, [{ slug: 'plain' }]);
    expect(s[0]!.max).toBe(70_000);
  });

  it('keeps a range within one price basis', () => {
    const mixed = [row('x', 's', '۱', 'M', 100), row('y', 's', '۲', 'M', 50_000_000, { priceBasis: 'branch' } as never)];
    const [s] = subSummaries(mixed, [{ slug: 's' }]);
    expect(s!.count).toBe(1);
  });
});

describe('sizeSummaries', () => {
  it('ranks sizes by priced rows and groups spellings by facet slug', () => {
    const s = sizeSummaries(ROWS);
    expect(s[0]).toMatchObject({ label: '۱۰', count: 3, min: 70_000, max: 95_000 });
    expect(s.map((x) => x.label)).toEqual(['۱۰', '۱۲']);
  });

  it('respects the limit and skips sizes with no confirmed price', () => {
    expect(sizeSummaries(ROWS, 1)).toHaveLength(1);
    expect(sizeSummaries(ROWS).some((x) => x.label === '۱۴' || x.label === '۸')).toBe(false);
  });
});
