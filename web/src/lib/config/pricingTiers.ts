/**
 * تخفیف پلکانی — volume (tonnage) discount tiers.
 *
 * THE SINGLE PLACE where discount percentages and tonnage thresholds live.
 * Nothing else in the codebase may hardcode a rate or a threshold: the owner
 * is expected to retune these numbers from real margin data, and retuning
 * must be a one-line edit here, not an engineering pass across components.
 *
 * Deliberately framework-free, and dependent only on the pure digit/number
 * formatters in `lib/utils/format` (same discipline as `lib/utils/weight.ts`),
 * so the browser bundle, the route handler and the proforma service all read
 * the identical numbers AND print the identical label. `resolveVolumeTier` is a
 * PURE function of (total weight, business-verified) — it does no I/O, so it
 * is trivially testable and auditable, which matters because its output is
 * money off a real customer's پیش‌فاکتور.
 *
 * ── Business decision of record (1405/06/01) ──────────────────────────────
 * The owner proposed the STRUCTURE and delegated the exact percentages,
 * stating a range for each band:
 *
 *   زیر ۵ تن            → base price, no discount
 *   ۵ تا ۲۰ تن          → ۱–۲٪ + صدور اولویت‌دار پیش‌فاکتور
 *   بالای ۲۰ تن یا حساب سازمانی تأییدشده → ۲–۴٪ + پشتیبانی LC/اعتباری + کارشناس اختصاصی
 *
 * The numbers chosen below sit in the LOWER half of each stated range:
 *
 *   bulk       1.5%  (range 1–2%)
 *   enterprise 2.5%  (range 2–4%)
 *
 * Why the lower half, and not the midpoint or the top:
 *
 *  1. A discount is far easier to RAISE than to lower. Going 1.5% → 2% reads
 *     to a returning buyer as goodwill; going 3% → 2% reads as a price hike
 *     on a number they have already been quoted and budgeted against. Start
 *     where there is room to move up.
 *  2. Distribution margin on steel in this market is thin and is measured in
 *     single-digit percent of the ton price. 2.5% off the invoice on a 20-ton
 *     order is a material share of the gross margin on that order; 4% may not
 *     survive contact with the actual cost sheet, which only the owner has.
 *  3. The non-price benefits (priority proforma issuance, LC/credit support,
 *     a dedicated rep) are the substantive part of the top tier for a
 *     corporate buyer. Leaning on those first keeps the headline percentage
 *     conservative without weakening the offer.
 *
 * These are an INITIAL BUSINESS DECISION, subject to owner revision. Change
 * `discountRate` below and nothing else needs to move.
 *
 * ── Boundary semantics (the off-by-one that costs money) ──────────────────
 * Thresholds are INCLUSIVE lower bounds, in kilograms:
 *   totalWeightKg <  5,000  → retail      (0%)   «زیر ۵ تن»
 *   totalWeightKg >= 5,000  → bulk        (1.5%)
 *   totalWeightKg >= 20,000 → enterprise  (2.5%)
 * So EXACTLY 5 tons gets the bulk discount and EXACTLY 20 tons gets the
 * enterprise discount. The owner's wording («۵ تا ۲۰ تن» / «بالای ۲۰ تن»)
 * is ambiguous at exactly 20 tons; we resolve it in the customer's favour,
 * which is also the only reading under which the three bands are a clean
 * partition with no gap. `pricingTiers.test.ts` pins both boundaries.
 */

import { toPersianDigits } from '@/lib/utils/format';

export type VolumeTierId = 'retail' | 'bulk' | 'enterprise';

export interface VolumeTier {
  id: VolumeTierId;
  /** Inclusive lower bound of the band, in kilograms. */
  minWeightKg: number;
  /** Fraction of the line-item subtotal taken off, BEFORE VAT. 0 = none. */
  discountRate: number;
  /** Customer-facing Persian name of the band. */
  label: string;
  /** Non-price benefits of the band — shown alongside the discount so the
   *  offer never reads as a bare percentage. */
  benefits: readonly string[];
}

/** One ton, in kilograms. Everything the app measures is in kg (SKU weights,
 *  `LineItem.weightKg`, the وزن‌سنج); tonnage is a presentation unit. */
export const KG_PER_TON = 1000;

/** Ordered LOW → HIGH by `minWeightKg`. `resolveVolumeTier` relies on that
 *  ordering; keep it if you add a band. */
export const VOLUME_TIERS: readonly VolumeTier[] = [
  {
    id: 'retail',
    minWeightKg: 0,
    // Zero by design, not a placeholder: «زیر ۵ تن» IS the base price. A
    // small/retail-project buyer pays the published number, which is what
    // makes the published number trustworthy.
    discountRate: 0,
    label: 'خرید خرد',
    benefits: ['قیمت پایه و شفاف', 'صدور پیش‌فاکتور رسمی'],
  },
  {
    id: 'bulk',
    minWeightKg: 5 * KG_PER_TON,
    // 1.5% — lower half of the owner's 1–2% band. See the file header.
    discountRate: 0.015,
    label: 'خرید عمده',
    benefits: ['تخفیف پلکانی روی کل سفارش', 'صدور اولویت‌دار پیش‌فاکتور'],
  },
  {
    id: 'enterprise',
    minWeightKg: 20 * KG_PER_TON,
    // 2.5% — lower half of the owner's 2–4% band. See the file header.
    discountRate: 0.025,
    label: 'سازمانی / پروژه‌ای',
    benefits: [
      'بیشترین تخفیف پلکانی',
      'پشتیبانی از خرید اعتباری و LC',
      'کارشناس فروش اختصاصی',
    ],
  },
];

const BY_ID: Readonly<Record<VolumeTierId, VolumeTier>> = Object.fromEntries(
  VOLUME_TIERS.map((t) => [t.id, t]),
) as Record<VolumeTierId, VolumeTier>;

/** The band an approved business account qualifies for regardless of tonnage
 *  (the owner's «یا حساب سازمانی تأییدشده» arm). */
export const VERIFIED_BUSINESS_TIER: VolumeTierId = 'enterprise';

export function volumeTierById(id: VolumeTierId): VolumeTier {
  return BY_ID[id];
}

export interface VolumeTierInput {
  /** TOTAL weight of the whole basket/inquiry in kilograms — never one line.
   *  A tier is a property of the order, not of a SKU. Lines with no known
   *  weight (توافقی, per-piece with no section table) contribute 0, which is
   *  the conservative direction: we never invent tonnage to grant a discount. */
  totalWeightKg: number;
  /** `users.biz_verify_status === 'approved'` — the SAME field the
   *  «حساب سازمانی تأییدشده» badge reads. 'pending' is NOT approved. */
  businessVerified?: boolean;
}

export interface ResolvedVolumeTier {
  tier: VolumeTier;
  /** True when the tier came from the verified-business override rather than
   *  from tonnage — the customer-facing line names a different reason. */
  viaBusinessAccount: boolean;
}

/**
 * The one function that decides a discount band. Pure.
 *
 * A verified business account is a FLOOR, not a cap: a verified buyer placing
 * 40 tons still lands on `enterprise` via tonnage, and if a future tier sits
 * above `enterprise` the tonnage path must still be able to reach it — hence
 * "the higher of the two", not "verified wins".
 */
export function resolveVolumeTier(input: VolumeTierInput): ResolvedVolumeTier {
  // Guard the whole numeric domain, not just negatives: NaN/Infinity here
  // would silently pick a band. A non-finite weight means "we don't know",
  // and "we don't know" must never buy a discount.
  const kg = Number.isFinite(input.totalWeightKg) ? Math.max(0, input.totalWeightKg) : 0;

  let byWeight = VOLUME_TIERS[0]!;
  for (const tier of VOLUME_TIERS) {
    if (kg >= tier.minWeightKg) byWeight = tier;
  }

  if (!input.businessVerified) return { tier: byWeight, viaBusinessAccount: false };

  const byAccount = BY_ID[VERIFIED_BUSINESS_TIER];
  // Compare on the RATE, not on array position: if the bands are ever
  // retuned so that a high-tonnage band beats the business floor, the buyer
  // keeps the better of the two either way.
  if (byWeight.discountRate >= byAccount.discountRate) {
    return { tier: byWeight, viaBusinessAccount: false };
  }
  return { tier: byAccount, viaBusinessAccount: true };
}

/**
 * The Toman amount a tier takes off a subtotal. Rounded to a whole Toman
 * (every money column in this app is an integer bigint) and clamped into
 * [0, subtotal] so it can never invert the invoice.
 */
export function volumeDiscountToman(subtotal: number, tier: VolumeTier): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (tier.discountRate <= 0) return 0;
  return Math.min(subtotal, Math.round(subtotal * tier.discountRate));
}

/** «۱٫۵» — the rate as a Persian-digit percentage for display, with the
 *  Persian decimal separator (U+066B), NOT a Latin dot. Kept here so no
 *  component re-derives (and re-rounds, or mis-punctuates) it from
 *  `discountRate`. Floating-point safe: 0.015 * 100 is 1.4999999999999998,
 *  so the multiply is rounded to 2 decimals before it is inspected. */
export function tierPercentLabel(tier: VolumeTier): string {
  const pct = Math.round(tier.discountRate * 100 * 100) / 100;
  return toPersianDigits(String(pct)).replace('.', '\u066b');
}

/** The line the customer reads on the پیش‌فاکتور next to the deducted amount.
 *  Names WHY they got it — tonnage or a verified business account — because a
 *  discount whose reason is invisible reads as an arbitrary number. */
export function volumeDiscountLabel(resolved: ResolvedVolumeTier): string {
  const pct = tierPercentLabel(resolved.tier);
  return resolved.viaBusinessAccount
    ? `تخفیف حساب سازمانی (${pct}٪)`
    : `تخفیف عمده (${pct}٪)`;
}
