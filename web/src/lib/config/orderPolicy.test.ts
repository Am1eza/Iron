import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER_POLICY, isAutoQuoteEligible, maximumManualDiscountToman } from './orderPolicy';

describe('order financial guardrails', () => {
  it('routes sub-minimum totals away from automatic issuance', () => {
    expect(isAutoQuoteEligible(DEFAULT_ORDER_POLICY.minimumAutoQuoteToman - 1, DEFAULT_ORDER_POLICY)).toBe(false);
    expect(isAutoQuoteEligible(DEFAULT_ORDER_POLICY.minimumAutoQuoteToman, DEFAULT_ORDER_POLICY)).toBe(true);
  });

  it('caps a manager manual discount to the configured fraction', () => {
    expect(maximumManualDiscountToman(10_000_000, DEFAULT_ORDER_POLICY)).toBe(300_000);
  });
});
