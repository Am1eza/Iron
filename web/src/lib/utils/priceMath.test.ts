import { describe, it, expect } from 'vitest';
import { PRICE_BASIS_VALUES } from '@/lib/types/domain';
import { lineTotalToman, lineWeightKg } from './priceMath';

/**
 * The pure half of the money path. `leads.pricing.test.ts` asserts the same
 * rules end-to-end against a real database; these are here so a change to the
 * arithmetic fails in milliseconds and names the basis it broke.
 */
describe('lineWeightKg', () => {
  it('is the quantity itself for a kg-counted, kg-priced line', () => {
    expect(lineWeightKg('kg', 'kg', 100, 12)).toBe(100);
  });

  it('converts a branch count through the branch weight', () => {
    expect(lineWeightKg('kg', 'branch', 5, 12.34)).toBe(61.7);
  });

  it('is undefined when a branch-counted line has no weight on file', () => {
    expect(lineWeightKg('kg', 'branch', 5, null)).toBeUndefined();
  });

  it.each(PRICE_BASIS_VALUES.filter((b) => b !== 'kg'))(
    'puts no mass in the chain for a %s basis, even with a weight on file',
    (basis) => {
      // The regression this exists for: a whole-item price multiplied by a
      // stored branch weight is off by exactly that weight.
      expect(lineWeightKg(basis, 'branch', 5, 12)).toBeUndefined();
    },
  );

  it('never derives a mass for a piece- or sqm-counted line', () => {
    expect(lineWeightKg('kg', 'piece', 5, 12)).toBeUndefined();
    expect(lineWeightKg('kg', 'sqm', 5, 12)).toBeUndefined();
  });
});

describe('lineTotalToman', () => {
  it('multiplies by the weight on a kg basis, not by the raw quantity', () => {
    // 5 شاخه × 12 kg × 42,000 — charging 5 × 42,000 instead is the 12×
    // undercharge this module was extracted to make impossible.
    expect(lineTotalToman('kg', 'branch', 5, 60, 42_000)).toBe(2_520_000);
  });

  it.each([
    ['branch', 'branch'],
    ['coil', 'branch'],
    ['sheet', 'sheet'],
    ['piece', 'piece'],
    ['sqm', 'sqm'],
  ] as const)('multiplies by the quantity on a %s basis counted in %s', (basis, unit) => {
    expect(lineTotalToman(basis, unit, 3, undefined, 42_000)).toBe(126_000);
  });

  it('refuses a whole-item price against a mismatched counting unit', () => {
    // Every one of these would produce a number, and every one would be wrong.
    expect(lineTotalToman('coil', 'kg', 20, 20, 42_000)).toBeUndefined();
    expect(lineTotalToman('piece', 'branch', 20, undefined, 42_000)).toBeUndefined();
    expect(lineTotalToman('sheet', 'piece', 20, undefined, 42_000)).toBeUndefined();
    expect(lineTotalToman('sqm', 'meter', 20, undefined, 42_000)).toBeUndefined();
  });

  it('is undefined with no unit price, on every basis', () => {
    for (const basis of PRICE_BASIS_VALUES) {
      expect(lineTotalToman(basis, 'branch', 5, 60, undefined)).toBeUndefined();
    }
  });

  it('is undefined on a kg basis with no computable weight', () => {
    expect(lineTotalToman('kg', 'branch', 5, undefined, 42_000)).toBeUndefined();
  });
});
