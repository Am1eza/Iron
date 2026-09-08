import { describe, expect, it } from 'vitest';
import { isValidPriceToman, MAX_PRICE_TOMAN, parsePriceToman, sumToman } from './priceValidation';

describe('integral Toman boundary', () => {
  it.each([0, -1, 0.1, 12000.5, NaN, Infinity, MAX_PRICE_TOMAN + 1, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (value) => {
    expect(isValidPriceToman(value)).toBe(false);
    expect(parsePriceToman(value)).toBeNull();
  });
  it.each(['۱۲٬۵۰۰', '١٢,٥٠٠', '12 500', '12500 تومان', 12500])('accepts explicit integral Toman %s', (value) => {
    expect(parsePriceToman(value)).toBe(12500);
  });
  it.each(['12500 ریال', '1e5', '12.5', '12,50', '=12500', '+12500', '', { formula: '1+1', result: 2 }])('rejects ambiguous cells %s', (value) => {
    expect(parsePriceToman(value)).toBeNull();
  });
  it('accepts the exact ceiling', () => {
    expect(parsePriceToman(MAX_PRICE_TOMAN)).toBe(MAX_PRICE_TOMAN);
  });
  it('refuses unsafe document aggregates', () => {
    expect(sumToman([10, 20])).toBe(30);
    expect(sumToman([Number.MAX_SAFE_INTEGER, 1])).toBeNull();
    expect(sumToman([1.5])).toBeNull();
    expect(sumToman([-1])).toBeNull();
  });
});
