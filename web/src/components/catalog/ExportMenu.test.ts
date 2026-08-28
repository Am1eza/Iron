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
describe('ExportMenu columns — the shared secondary-spec column stays context-aware', () => {
  it('adds an ابعاد header for ورق, right after ضخامت', () => {
    const c = cols('sheet');
    expect(c).toEqual(['محصول', 'ضخامت', 'ابعاد', 'کارخانه', 'وزن شاخه (kg)', 'قیمت (تومان)', 'نوسان', 'زمان تحویل']);
  });

  it('leaves every other category on the original column set', () => {
    for (const slug of ['rebar', 'pipe', undefined]) {
      expect(cols(slug)).toEqual(['محصول', 'سایز', 'کارخانه', 'وزن شاخه (kg)', 'قیمت (تومان)', 'نوسان', 'زمان تحویل']);
    }
  });

  it('adds ضخامت only for the three approved نبشی subs', () => {
    for (const sub of ['nabshi', 'angle-unequal', 'spot']) {
      expect(cols('angle-channel', sub)).toEqual([
        'محصول',
        'سایز',
        'ضخامت',
        'کارخانه',
        'وزن شاخه (kg)',
        'قیمت (تومان)',
        'نوسان',
        'زمان تحویل',
      ]);
    }
    for (const sub of ['val-post', 'tbar', null]) {
      expect(cols('angle-channel', sub)).not.toContain('ضخامت');
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

/**
 * The exported file used to carry the bare price unconditionally, so a buyer
 * looking at «با ارزش‌افزوده» prices on screen downloaded a different number
 * than the one they had just been quoted — and nothing in the file said which
 * of the two it was. These pin the export to the toggle.
 */
describe('ExportMenu prices — the file follows the on-screen VAT toggle', () => {
  const priceOf = (cells: string[]) => cells[cols('rebar').indexOf('قیمت (تومان)')];

  it('writes the bare price when the toggle is off', () => {
    expect(priceOf(rowCells(row(), false, false))).toBe('۵۰۰٬۰۰۰');
  });

  it('writes the VAT-inclusive price when the toggle is on', () => {
    expect(priceOf(rowCells(row(), false, true))).toBe('۵۵۰٬۰۰۰');
  });

  it('honours the admin-configured rate rather than the static default', () => {
    expect(priceOf(rowCells(row(), false, true, 0.09))).toBe('۵۴۵٬۰۰۰');
  });

  it('defaults to the bare price, so the existing call sites are unchanged', () => {
    expect(priceOf(rowCells(row(), false))).toBe(priceOf(rowCells(row(), false, false)));
  });

  it('leaves a stale-hidden price as «تماس بگیرید» instead of applying VAT to it', () => {
    // `priceHiddenLabel` short-circuits before the arithmetic; a hidden price
    // must not leak a number into the file by way of the VAT branch.
    const cells = rowCells(row({ current: { priceHidden: true } as never }), false, true);
    expect(priceOf(cells)).not.toMatch(/[۰-۹]/);
  });
});
