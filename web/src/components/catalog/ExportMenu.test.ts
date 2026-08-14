import { describe, it, expect } from 'vitest';
import { cols, rowCells } from './ExportMenu';
import type { PriceRow } from '@/lib/types/domain';

function row(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    id: 'sku-1',
    subCategoryId: 'black',
    categoryId: 'sheet',
    slug: 'test-sku',
    name: 'ورق سیاه ۲',
    size: '۲',
    factory: 'فولاد مبارکه',
    unit: 'kg',
    isActive: true,
    ...overrides,
    current: {
      skuId: 'sku-1',
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
      ...overrides.current,
    },
  } as PriceRow;
}

/**
 * The exported file is positional — headers and cells are two independent
 * arrays zipped by index — so «ابعاد» being conditional is exactly the kind of
 * thing that silently files every factory name under «وزن شاخه» in a customer's
 * spreadsheet. These assertions pin the two arrays to each other.
 */
describe('ExportMenu columns — ورق carries ابعاد, nothing else does', () => {
  it('adds an ابعاد header for ورق, right after ضخامت', () => {
    const c = cols('sheet');
    expect(c).toEqual(['محصول', 'ضخامت', 'ابعاد', 'کارخانه', 'وزن شاخه (kg)', 'قیمت (تومان)', 'نوسان', 'زمان تحویل']);
  });

  it('leaves every other category on the original column set', () => {
    for (const slug of ['rebar', 'pipe', undefined]) {
      expect(cols(slug)).toEqual(['محصول', 'سایز', 'کارخانه', 'وزن شاخه (kg)', 'قیمت (تومان)', 'نوسان', 'زمان تحویل']);
    }
  });

  it('keeps cells aligned with headers in both shapes', () => {
    expect(rowCells(row({ dimensions: '۱۰۰۰×۲۰۰۰' }), true)).toHaveLength(cols('sheet').length);
    expect(rowCells(row(), false)).toHaveLength(cols('rebar').length);
  });

  it('puts the dimensions in the ابعاد slot and keeps کارخانه after it', () => {
    const header = cols('sheet');
    const cells = rowCells(row({ dimensions: '۱۰۰۰×۲۰۰۰' }), true);
    expect(cells[header.indexOf('ابعاد')]).toBe('۱۰۰۰×۲۰۰۰');
    expect(cells[header.indexOf('کارخانه')]).toBe('فولاد مبارکه');
    expect(cells[header.indexOf('ضخامت')]).toBe('۲');
  });

  it('writes «نامشخص» for a ورق row nobody has filled in yet, rather than dropping the cell and shifting the file', () => {
    const cells = rowCells(row(), true);
    expect(cells).toHaveLength(cols('sheet').length);
    expect(cells[cols('sheet').indexOf('ابعاد')]).toBe('نامشخص');
  });

  it('omits the cell for a non-ورق row, matching its shorter header', () => {
    // Belt and braces: even a row that somehow carries a value must not grow a
    // cell the header has no column for.
    expect(rowCells(row({ dimensions: '۱۰۰۰×۲۰۰۰' }), false)).toHaveLength(cols('rebar').length);
  });
});
