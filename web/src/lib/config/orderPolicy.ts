/** Operational guardrails around automatic quotes. Defaults deliberately
 * qualify small requests for human review instead of rejecting the lead. */
export interface OrderPolicy {
  version: string;
  minimumAutoQuoteToman: number;
  maximumManagerDiscountRate: number;
  maximumTotalDiscountRate: number;
}

export const DEFAULT_ORDER_POLICY: OrderPolicy = {
  version: '1405-06-13',
  // A deliberately low safe default: rejects accidental/test-sized totals
  // from automatic financial issuance without excluding legitimate small
  // fittings orders. The owner can raise it from Settings using real data.
  minimumAutoQuoteToman: 100_000,
  maximumManagerDiscountRate: 0.03,
  maximumTotalDiscountRate: 0.03,
};

export function isAutoQuoteEligible(subtotal: number, policy: OrderPolicy): boolean {
  return Number.isFinite(subtotal) && subtotal >= policy.minimumAutoQuoteToman;
}

export function maximumManualDiscountToman(subtotal: number, policy: OrderPolicy): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return Math.floor(subtotal * policy.maximumManagerDiscountRate);
}
