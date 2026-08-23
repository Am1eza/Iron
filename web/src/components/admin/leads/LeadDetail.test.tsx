/**
 * `proformaTotals` IS the money. It mirrors `issueProforma`
 * (src/lib/server/services/leads.service.ts) exactly, and the only reason it
 * exists as a named export is so that mirror can be pinned down by a test:
 * when the preview a rep reads off the screen and the numbers frozen into the
 * customer's document disagree, nobody finds out until the customer calls.
 * So the formula is asserted against a literal re-statement of the server's,
 * not against hand-computed magic numbers.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LineItem } from '@/lib/types/domain';
import { LeadDetail, proformaTotals } from './LeadDetail';
import { KG_PER_TON, resolveVolumeTier, volumeDiscountToman } from '@/lib/config/pricingTiers';

/** The server's formula, transcribed from issueProforma — the thing the
 *  client is required to agree with, byte for byte. Including the تخفیف
 *  پلکانی step: the volume discount comes off FIRST and the manual figure is
 *  then clamped into what is left, so an oversized manual discount can never
 *  swallow the band the customer's sheet still claims to grant. */
function serverTotals(
  lines: Array<{ lineTotal?: number; weightKg?: number }>,
  discountToman: number,
  vatRate: number,
  businessVerified = false,
) {
  const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const totalWeightKg = lines.reduce((s, l) => s + (l.weightKg ?? 0), 0);
  const { tier } = resolveVolumeTier({ totalWeightKg, businessVerified });
  const volumeDiscount = volumeDiscountToman(subtotal, tier);
  const discount = Math.min(Math.max(discountToman, 0), subtotal - volumeDiscount);
  const taxable = subtotal - volumeDiscount - discount;
  const vatAmount = Math.round(taxable * vatRate);
  const total = taxable + vatAmount;
  return { subtotal, volumeDiscount, discount, taxable, vatAmount, total };
}

const item = (unitPrice: number | null, lineTotal: number | null, weightKg?: number) => ({
  unitPrice,
  lineTotal,
  weightKg,
});

describe('proformaTotals', () => {
  it('sums the priced lines only — an unpriced line never inflates the subtotal', () => {
    // The server issues from `items.filter(i => i.unitPrice)`; a «قلم بدون
    // قیمت» carries a null lineTotal but must not count even if one leaks in.
    const items = [item(1000, 5_000_000), item(null, null), item(null, 9_999_999)];
    expect(proformaTotals(items, 0).subtotal).toBe(5_000_000);
  });

  it('clamps the discount to [0, subtotal] exactly as the server does', () => {
    const items = [item(1000, 5_000_000)];
    const priced = [{ lineTotal: 5_000_000 }];

    // Above the order — capped at the subtotal, never a negative taxable.
    expect(proformaTotals(items, 9_000_000, 0.1)).toEqual(serverTotals(priced, 9_000_000, 0.1));
    expect(proformaTotals(items, 9_000_000, 0.1).discount).toBe(5_000_000);
    expect(proformaTotals(items, 9_000_000, 0.1).taxable).toBe(0);

    // Below zero — floored at zero, never a discount that ADDS money.
    expect(proformaTotals(items, -1, 0.1)).toEqual(serverTotals(priced, -1, 0.1));
    expect(proformaTotals(items, -1, 0.1).discount).toBe(0);

    // Exactly at each end.
    expect(proformaTotals(items, 0, 0.1)).toEqual(serverTotals(priced, 0, 0.1));
    expect(proformaTotals(items, 5_000_000, 0.1)).toEqual(serverTotals(priced, 5_000_000, 0.1));
  });

  it('derives taxable / vat / total the way the server does', () => {
    const items = [item(1000, 4_000_000), item(2000, 3_000_000)];
    const t = proformaTotals(items, 500_000, 0.1);
    expect(t.subtotal).toBe(7_000_000);
    expect(t.taxable).toBe(6_500_000);
    expect(t.vatAmount).toBe(650_000);
    expect(t.total).toBe(t.taxable + t.vatAmount);
    expect(t).toEqual(serverTotals([{ lineTotal: 4_000_000 }, { lineTotal: 3_000_000 }], 500_000, 0.1));
  });

  it('rounds VAT to a whole Toman — every figure is an integer', () => {
    // 1,234,567 × 9% = 111,111.03 — must not reach a document as a fraction.
    const items = [item(1, 1_234_567)];
    const t = proformaTotals(items, 0, 0.09);
    expect(t.vatAmount).toBe(Math.round(1_234_567 * 0.09));
    for (const [key, value] of Object.entries(t)) {
      expect(Number.isInteger(value), `${key} = ${value} is not integer Toman`).toBe(true);
    }
    expect(t).toEqual(serverTotals([{ lineTotal: 1_234_567 }], 0, 0.09));
  });

  it('rounds a fractional discount clamp the same way at the boundary', () => {
    // A discount landing exactly on the subtotal leaves a zero taxable AND a
    // zero VAT — the "free order" edge, which must not round up to 1 Toman.
    const t = proformaTotals([item(1, 999_999)], 999_999, 0.09);
    expect(t).toEqual({
      subtotal: 999_999,
      volumeDiscount: 0,
      discount: 999_999,
      taxable: 0,
      vatAmount: 0,
      total: 0,
    });
  });

  it('leaves the zero-discount case untouched: total === subtotal + vat', () => {
    const items = [item(1000, 5_000_000), item(1000, 2_500_000)];
    const t = proformaTotals(items, 0, 0.1);
    expect(t.discount).toBe(0);
    expect(t.taxable).toBe(t.subtotal);
    expect(t.total).toBe(t.subtotal + t.vatAmount);
  });

  it('is zero across the board for an empty / entirely unpriced lead', () => {
    expect(proformaTotals([], 100_000, 0.1)).toEqual({
      subtotal: 0,
      volumeDiscount: 0,
      discount: 0,
      taxable: 0,
      vatAmount: 0,
      total: 0,
    });
    expect(proformaTotals([item(null, null)], 100_000, 0.1).discount).toBe(0);
  });
});

/* ------------------------- تخفیف پلکانی (volume tiers) ------------------------- */

describe('proformaTotals — volume discount tiers', () => {
  it('applies nothing under 5 tons', () => {
    const items = [item(1000, 10_000_000, 4_999)];
    const t = proformaTotals(items, 0, 0.1);
    expect(t.volumeDiscount).toBe(0);
    expect(t.taxable).toBe(10_000_000);
  });

  it('applies the bulk band at exactly 5 tons, before VAT', () => {
    const items = [item(1000, 10_000_000, 5 * KG_PER_TON)];
    const t = proformaTotals(items, 0, 0.1);
    expect(t.volumeDiscount).toBe(150_000); // 1.5%
    expect(t.taxable).toBe(9_850_000);
    expect(t.vatAmount).toBe(985_000);
    expect(t.total).toBe(9_850_000 + 985_000);
    expect(t).toEqual(serverTotals([{ lineTotal: 10_000_000, weightKg: 5 * KG_PER_TON }], 0, 0.1));
  });

  it('applies the enterprise band at exactly 20 tons', () => {
    const items = [item(1000, 10_000_000, 20 * KG_PER_TON)];
    expect(proformaTotals(items, 0, 0.1).volumeDiscount).toBe(250_000); // 2.5%
  });

  it('lifts a small order to the enterprise band for a verified business', () => {
    const items = [item(1000, 10_000_000, 100)];
    expect(proformaTotals(items, 0, 0.1, true).volumeDiscount).toBe(250_000);
    expect(proformaTotals(items, 0, 0.1, false).volumeDiscount).toBe(0);
  });

  it('never lets an oversized manual discount swallow the tier discount', () => {
    const items = [item(1000, 10_000_000, 20 * KG_PER_TON)];
    const t = proformaTotals(items, 99_000_000, 0.1);
    expect(t.volumeDiscount).toBe(250_000);
    expect(t.discount).toBe(9_750_000); // clamped into what is left
    expect(t.taxable).toBe(0);
    expect(t.total).toBe(0);
  });

  it('counts tonnage from the PRICED lines only', () => {
    // An unpriced 20-ton line contributes no money, so it must not buy a
    // discount on the priced ones either.
    const items = [item(1000, 10_000_000, 100), item(null, null, 20 * KG_PER_TON)];
    expect(proformaTotals(items, 0, 0.1).volumeDiscount).toBe(0);
  });

  it('keeps the printed identity subtotal − discounts + vat === total', () => {
    const items = [item(1000, 7_777_777, 12 * KG_PER_TON)];
    const t = proformaTotals(items, 123_456, 0.1);
    expect(t.subtotal - t.volumeDiscount - t.discount + t.vatAmount).toBe(t.total);
  });
});

/* ---------------------------- mounted summary ---------------------------- */

const leadItem: LineItem & { id: string; currentPrice: number | null } = {
  id: 'it1',
  skuId: 'sku1',
  name: 'میلگرد ۱۴',
  qty: 5,
  unit: 'kg',
  weightKg: 5000,
  unitPrice: 1_000_000,
  lineTotal: 5_000_000,
  currentPrice: 1_000_000,
};

vi.mock('@/lib/api/resources/admin', () => ({
  adminApi: {
    lead: () =>
      Promise.resolve({
        lead: {
          id: 'ld1',
          ref: 'LD-1',
          userId: null,
          contactName: 'رضا',
          contactMobile: '09120000000',
          contactVerified: true,
          source: 'table',
          cooperationType: null,
          context: null,
          channelPref: 'sms',
          status: 'contacted',
          assigneeId: null,
          callbackAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [leadItem],
        notes: [],
        proformas: [],
      }),
    staff: () => Promise.resolve({ staff: [] }),
    updateLead: vi.fn(),
    addLeadNote: vi.fn(),
  },
}));

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LeadDetail id="ld1" />
    </QueryClientProvider>,
  );
}

describe('LeadDetail proforma summary', () => {
  // The row is «تخفیف دستی», not «تخفیف»: since the تخفیف پلکانی band got its
  // own row, two rows labelled «تخفیف» would sit next to each other and a rep
  // could not tell the rule-based entitlement from their own figure. The
  // INPUT above it is still labelled «تخفیف (تومان)» — that field only ever
  // took the manual figure.
  it('shows the تخفیف دستی row with a real U+2212 minus once a discount is entered, and hides it at zero', async () => {
    const user = userEvent.setup();
    renderDetail();

    // No discount typed → the row does not exist at all (not a «−۰»).
    expect(await screen.findByText('جمع اقلام')).toBeInTheDocument();
    expect(screen.queryByText('تخفیف دستی')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('تخفیف (تومان)'), '500000');

    expect(await screen.findByText('تخفیف دستی')).toBeInTheDocument();
    // U+2212 MINUS SIGN, not an ASCII hyphen — the typographic contract for
    // money in this panel.
    expect(screen.getByText('−۵۰۰٬۰۰۰')).toBeInTheDocument();
    // …and the pre-VAT line drops by that amount AND by the tier discount
    // below: 5,000,000 − 75,000 − 500,000.
    expect(screen.getByText('۴٬۴۲۵٬۰۰۰ تومان')).toBeInTheDocument();
  });

  // The fixture line weighs exactly 5,000 kg, which is the bulk boundary —
  // so the rendered summary is a real end-to-end check that the band, its
  // percentage and its amount all reach the rep's screen, not just the pure
  // function above.
  it('shows the تخفیف پلکانی row, named with its band and rate, at exactly 5 tons', async () => {
    renderDetail();

    expect(await screen.findByText('تخفیف عمده (۱٫۵٪)')).toBeInTheDocument();
    expect(screen.getByText('−۷۵٬۰۰۰')).toBeInTheDocument();
    // With no manual discount typed, the manual row stays absent.
    expect(screen.queryByText('تخفیف دستی')).not.toBeInTheDocument();
    // Pre-VAT = 5,000,000 − 75,000.
    expect(screen.getByText('۴٬۹۲۵٬۰۰۰ تومان')).toBeInTheDocument();
  });
});
