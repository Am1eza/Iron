/**
 * Cart selectors — the estimate a customer sees before they even submit a
 * request must agree with what `priceItems`/`createLead` actually charges on
 * the issued پیش‌فاکتور (see leads.service.ts's priceItems for the server
 * side of this same convention: unitPrice is per KILOGRAM regardless of
 * `unit`; `weightKg` only applies for piece-priced units).
 */
import { describe, it, expect } from 'vitest';
import { cartItemWeightKg, selectCartEstTotal, selectCartTotalWeight } from './cart';
import type { CartItem } from './cart';

function state(items: CartItem[]) {
  return { items } as Parameters<typeof selectCartEstTotal>[0];
}

describe('cartItemWeightKg', () => {
  it('for a kg-unit item, qty IS the weight — weightKg (a per-branch reference figure) does not apply', () => {
    const item: CartItem = { skuId: 'a', name: 'a', qty: 100, unit: 'kg', weightKg: 12 };
    expect(cartItemWeightKg(item)).toBe(100);
  });

  it('for a piece-priced item, weight = weightKg (per piece) × qty (piece count)', () => {
    const item: CartItem = { skuId: 'a', name: 'a', qty: 5, unit: 'branch', weightKg: 12 };
    expect(cartItemWeightKg(item)).toBe(60);
  });

  it('a piece-priced item with no weightKg on file contributes 0, not NaN or the raw qty', () => {
    const item: CartItem = { skuId: 'a', name: 'a', qty: 5, unit: 'branch' };
    expect(cartItemWeightKg(item)).toBe(0);
  });
});

describe('selectCartEstTotal / selectCartTotalWeight', () => {
  it('a kg-unit line prices at unitPrice × qty — NOT inflated by weightKg', () => {
    // Regression for the audit-2026-08-08 bug: PriceTable.addToCart always
    // stores weightKg=theoreticalWeightKg even for kg-unit SKUs (it's just
    // informational), and the old selector multiplied by it unconditionally
    // — a rebar line (unitPrice 42,000/kg, theoreticalWeightKg 12) showed an
    // estimate 12× the real total, vs. what createLead actually charges.
    const s = state([{ skuId: 'a', name: 'a', qty: 100, unit: 'kg', unitPrice: 42_000, weightKg: 12 }]);
    expect(selectCartEstTotal(s)).toBe(100 * 42_000);
    expect(selectCartTotalWeight(s)).toBe(100);
  });

  it('a branch-unit line prices at unitPrice (per kg) × real weight, matching priceItems', () => {
    const s = state([{ skuId: 'a', name: 'a', qty: 5, unit: 'branch', unitPrice: 42_000, weightKg: 12 }]);
    expect(selectCartEstTotal(s)).toBe(5 * 12 * 42_000);
    expect(selectCartTotalWeight(s)).toBe(60);
  });

  it('sums correctly across a mix of kg and piece-priced lines', () => {
    const s = state([
      { skuId: 'a', name: 'a', qty: 100, unit: 'kg', unitPrice: 42_000, weightKg: 12 },
      { skuId: 'b', name: 'b', qty: 5, unit: 'branch', unitPrice: 30_000, weightKg: 10 },
    ]);
    expect(selectCartEstTotal(s)).toBe(100 * 42_000 + 5 * 10 * 30_000);
    expect(selectCartTotalWeight(s)).toBe(100 + 50);
  });
});
