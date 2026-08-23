/**
 * Boundary tests for the تخفیف پلکانی bands.
 *
 * This is money arithmetic on a customer-facing پیش‌فاکتور, so every band edge
 * is pinned EXACTLY (4,999 / 5,000 / 19,999 / 20,000 kg) rather than sampled
 * from the middle of a band. An off-by-one here does not throw — it quietly
 * over- or under-charges every order that lands on the edge.
 */
import { describe, it, expect } from 'vitest';
import {
  KG_PER_TON,
  VOLUME_TIERS,
  resolveVolumeTier,
  tierPercentLabel,
  volumeDiscountLabel,
  volumeDiscountToman,
  volumeTierById,
} from './pricingTiers';

describe('resolveVolumeTier — tonnage bands', () => {
  it('under 5 tons is the base price, no discount', () => {
    for (const kg of [0, 1, 100, 4_999, 4_999.99]) {
      const r = resolveVolumeTier({ totalWeightKg: kg });
      expect(r.tier.id, `${kg}kg`).toBe('retail');
      expect(r.tier.discountRate).toBe(0);
    }
  });

  it('EXACTLY 5 tons qualifies for the bulk band (inclusive lower bound)', () => {
    const r = resolveVolumeTier({ totalWeightKg: 5 * KG_PER_TON });
    expect(r.tier.id).toBe('bulk');
  });

  it('one kilogram under 5 tons does NOT', () => {
    expect(resolveVolumeTier({ totalWeightKg: 5 * KG_PER_TON - 1 }).tier.id).toBe('retail');
  });

  it('5–20 tons is the bulk band', () => {
    for (const kg of [5_000, 5_001, 12_000, 19_999]) {
      expect(resolveVolumeTier({ totalWeightKg: kg }).tier.id, `${kg}kg`).toBe('bulk');
    }
  });

  it('EXACTLY 20 tons qualifies for the enterprise band (ambiguity resolved for the buyer)', () => {
    const r = resolveVolumeTier({ totalWeightKg: 20 * KG_PER_TON });
    expect(r.tier.id).toBe('enterprise');
    expect(r.viaBusinessAccount).toBe(false);
  });

  it('one kilogram under 20 tons stays in bulk', () => {
    expect(resolveVolumeTier({ totalWeightKg: 20 * KG_PER_TON - 1 }).tier.id).toBe('bulk');
  });

  it('above 20 tons stays in the enterprise band', () => {
    expect(resolveVolumeTier({ totalWeightKg: 250 * KG_PER_TON }).tier.id).toBe('enterprise');
  });
});

describe('resolveVolumeTier — verified business account', () => {
  it('a verified business buying a SMALL order still gets the enterprise band', () => {
    const r = resolveVolumeTier({ totalWeightKg: 200, businessVerified: true });
    expect(r.tier.id).toBe('enterprise');
    // …and the customer-facing reason is the account, not the tonnage.
    expect(r.viaBusinessAccount).toBe(true);
  });

  it('an UNVERIFIED buyer with a large order still gets the enterprise band on tonnage', () => {
    const r = resolveVolumeTier({ totalWeightKg: 30 * KG_PER_TON, businessVerified: false });
    expect(r.tier.id).toBe('enterprise');
    expect(r.viaBusinessAccount).toBe(false);
  });

  it('a verified business with a large order is credited to tonnage, not the account', () => {
    // Same band either way — but the printed line must not claim the account
    // is what earned it when the order alone did.
    const r = resolveVolumeTier({ totalWeightKg: 40 * KG_PER_TON, businessVerified: true });
    expect(r.tier.id).toBe('enterprise');
    expect(r.viaBusinessAccount).toBe(false);
  });

  it('the verified override never LOWERS a band the tonnage already earned', () => {
    for (const kg of [0, 5_000, 20_000, 100_000]) {
      const plain = resolveVolumeTier({ totalWeightKg: kg });
      const verified = resolveVolumeTier({ totalWeightKg: kg, businessVerified: true });
      expect(verified.tier.discountRate, `${kg}kg`).toBeGreaterThanOrEqual(plain.tier.discountRate);
    }
  });
});

describe('resolveVolumeTier — hostile inputs never buy a discount', () => {
  it('negative, NaN and Infinity all fall back to the base band', () => {
    for (const kg of [-1, -1_000_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(resolveVolumeTier({ totalWeightKg: kg }).tier.id, String(kg)).toBe('retail');
    }
  });
});

describe('volumeDiscountToman', () => {
  it('is a whole-Toman percentage of the subtotal', () => {
    const bulk = volumeTierById('bulk');
    expect(volumeDiscountToman(100_000_000, bulk)).toBe(1_500_000); // 1.5%
    const ent = volumeTierById('enterprise');
    expect(volumeDiscountToman(100_000_000, ent)).toBe(2_500_000); // 2.5%
  });

  it('rounds to an integer Toman (every money column is a bigint)', () => {
    const amount = volumeDiscountToman(1_234_567, volumeTierById('bulk'));
    expect(Number.isInteger(amount)).toBe(true);
    expect(amount).toBe(Math.round(1_234_567 * 0.015));
  });

  it('is zero for the base band, however large the order', () => {
    expect(volumeDiscountToman(9_999_999_999, volumeTierById('retail'))).toBe(0);
  });

  it('is zero for a zero, negative or non-finite subtotal', () => {
    const bulk = volumeTierById('bulk');
    expect(volumeDiscountToman(0, bulk)).toBe(0);
    expect(volumeDiscountToman(-5_000, bulk)).toBe(0);
    expect(volumeDiscountToman(Number.NaN, bulk)).toBe(0);
  });

  it('can never exceed the subtotal', () => {
    for (const tier of VOLUME_TIERS) {
      expect(volumeDiscountToman(1_000, tier)).toBeLessThanOrEqual(1_000);
    }
  });
});

describe('display labels', () => {
  it('renders the rate in Persian digits with the Persian decimal separator', () => {
    expect(tierPercentLabel(volumeTierById('bulk'))).toBe('۱٫۵');
    expect(tierPercentLabel(volumeTierById('enterprise'))).toBe('۲٫۵');
    expect(tierPercentLabel(volumeTierById('retail'))).toBe('۰');
  });

  it('names tonnage or the business account as the reason', () => {
    expect(volumeDiscountLabel(resolveVolumeTier({ totalWeightKg: 10 * KG_PER_TON }))).toBe(
      'تخفیف عمده (۱٫۵٪)',
    );
    expect(
      volumeDiscountLabel(resolveVolumeTier({ totalWeightKg: 10, businessVerified: true })),
    ).toBe('تخفیف حساب سازمانی (۲٫۵٪)');
  });
});

describe('the tier table itself', () => {
  it('is ordered low → high, which resolveVolumeTier depends on', () => {
    const mins = VOLUME_TIERS.map((t) => t.minWeightKg);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it('keeps every rate inside the range the owner stated', () => {
    // The owner delegated the exact numbers but NOT the ranges. If a future
    // edit pushes a rate outside its band, that is a business decision that
    // needs the owner, and this test is the tripwire.
    expect(volumeTierById('retail').discountRate).toBe(0);
    expect(volumeTierById('bulk').discountRate).toBeGreaterThanOrEqual(0.01);
    expect(volumeTierById('bulk').discountRate).toBeLessThanOrEqual(0.02);
    expect(volumeTierById('enterprise').discountRate).toBeGreaterThanOrEqual(0.02);
    expect(volumeTierById('enterprise').discountRate).toBeLessThanOrEqual(0.04);
  });

  it('starts at zero kg so every order resolves to some band', () => {
    expect(VOLUME_TIERS[0]!.minWeightKg).toBe(0);
  });
});
