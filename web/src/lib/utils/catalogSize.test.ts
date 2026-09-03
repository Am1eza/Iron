import { describe, expect, it } from 'vitest';
import { catalogSizeNumbers, compareCatalogSizes, normalizeDimensionToken } from './catalogSize';

describe('catalogSizeNumbers', () => {
  it('preserves all axes of real two- and three-dimensional sections', () => {
    expect(catalogSizeNumbers('۶۰×۶۰×۶')).toEqual([60, 60, 6]);
    expect(catalogSizeNumbers('40 * 80')).toEqual([40, 80]);
  });

  it('understands decimal and fractional trade sizes as one value each', () => {
    expect(catalogSizeNumbers('۱٫۵ میلی‌متر')).toEqual([1.5]);
    expect(catalogSizeNumbers('۱½ اینچ')).toEqual([1.5]);
    expect(catalogSizeNumbers('۳/۴ اینچ')).toEqual([0.75]);
  });
});

describe('compareCatalogSizes', () => {
  it('sorts by every dimension instead of only the leading number', () => {
    const sizes = ['۸۰×۸۰×۸', '۶۰×۶۰×۶', '۶۰×۶۰×۵'];
    expect(sizes.sort(compareCatalogSizes)).toEqual(['۶۰×۶۰×۵', '۶۰×۶۰×۶', '۸۰×۸۰×۸']);
  });

  it('sorts an unparseable label after numeric sizes', () => {
    expect(['سفارشی', '۱۰', '۲'].sort(compareCatalogSizes)).toEqual(['۲', '۱۰', 'سفارشی']);
  });
});

it('normalizes three-axis input without dropping the third axis', () => {
  expect(normalizeDimensionToken('60 x 60 * 6')).toBe('60×60×6');
});
