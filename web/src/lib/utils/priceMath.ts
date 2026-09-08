/**
 * The one place a stored price is turned into money.
 *
 * `leads.service.priceItems` and `estimate.service.estimateItems` used to
 * carry two hand-copied versions of this arithmetic, and both shipped the
 * identical bug (charging `unitPrice × qty` where `unitPrice × weightKg` was
 * meant — «۱۰۰ شاخه ≈ ۱۲۰۰ کیلوگرم, billed as ۱۰۰»). They now both call these
 * two functions, so a third denomination cannot be handled correctly in one
 * and wrongly in the other.
 *
 * Deliberately pure and dependency-free so the same rules can be asserted in
 * a unit test and reused from a client component.
 */
import {
  PRICE_BASIS_COUNTING_UNIT,
  type PriceBasis,
  type PriceUnit,
} from '@/lib/types/domain';
import { isValidPriceToman } from './priceValidation';

/**
 * The kilograms a line actually represents, or `undefined` when there are
 * none to speak of.
 *
 * A non-`kg` basis has no mass anywhere in its money chain: a کوپلر is quoted
 * per عدد, a لوله مسی per ۱۵-متری کلاف, a ساندویچ‌پانل per متر مربع. Left
 * undefined rather than derived so nothing downstream can present a
 * fabricated tonnage and so `totalWeightKg` counts only material that has a
 * mass on file.
 */
export function lineWeightKg(
  basis: PriceBasis,
  unit: PriceUnit,
  qty: number,
  theoreticalWeightKg: number | null | undefined,
): number | undefined {
  if (!Number.isFinite(qty) || qty <= 0 || qty > Number.MAX_SAFE_INTEGER) return undefined;
  if (basis !== 'kg') return undefined;
  // Belt and braces: a piece- or sqm-counted line has no per-piece mass to
  // multiply even if someone sets its basis back to kg by hand.
  if (unit === 'piece' || unit === 'sqm') return undefined;
  if (unit === 'kg') return qty;
  if (theoreticalWeightKg == null || !Number.isFinite(theoreticalWeightKg) || theoreticalWeightKg <= 0) return undefined;
  const grams = Math.round(theoreticalWeightKg * qty * 1000);
  return Number.isSafeInteger(grams) && grams > 0 ? grams / 1000 : undefined;
}

/**
 * The line total in Toman, or `undefined` when it cannot be computed — which
 * every caller treats as "not auto-quotable", i.e. `allPriced=false` and the
 * lead goes to a human. Never guess: an undefined total is the safe state.
 *
 * Two paths, chosen by the basis and nothing else:
 *
 *   - `kg` → `unitPrice × weightKg`. A branch/sheet count has already been
 *     converted to kilograms by `lineWeightKg`; multiplying by raw `qty` here
 *     is the 12× undercharge this module exists to make impossible.
 *   - anything else → `unitPrice × qty`, but ONLY when the line counts in the
 *     same whole thing the price is per (`PRICE_BASIS_COUNTING_UNIT`).
 *     «۲۰ کیلوگرم» against a per-coil price is a mismatch, not a conversion.
 */
export function lineTotalToman(
  basis: PriceBasis,
  unit: PriceUnit,
  qty: number,
  weightKg: number | undefined,
  unitPrice: number | undefined,
): number | undefined {
  if (!isValidPriceToman(unitPrice) || !Number.isFinite(qty) || qty <= 0) return undefined;
  const counting = PRICE_BASIS_COUNTING_UNIT[basis];
  if (counting != null && unit !== counting) return undefined;
  const quantity = counting != null ? qty : weightKg;
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return undefined;
  const total = Math.round(unitPrice * quantity);
  return Number.isSafeInteger(total) && total > 0 ? total : undefined;
}
