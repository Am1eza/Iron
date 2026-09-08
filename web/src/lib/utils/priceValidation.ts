/** Prices are positive, integral Toman. This is a technical ceiling, not an
 * industry anomaly threshold; legitimate changes still need source review. */
export const MAX_PRICE_TOMAN = 10_000_000_000_000;

export function isValidPriceToman(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE_TOMAN;
}

/** Exact-in-JavaScript aggregate boundary for document totals. */
export function sumToman(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** Never silently interpret Rial, formulas, decimals or scientific notation
 * as Toman. Grouped Persian/Arabic/Latin digits and a Toman suffix are allowed. */
export function parsePriceToman(value: unknown): number | null {
  if (typeof value === 'number') return isValidPriceToman(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .trim().replace(/\s*تومان$/, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:[,٬ ]\d{3})+)$/.test(normalized)) return null;
  const price = Number(normalized.replace(/[,٬ ]/g, ''));
  return isValidPriceToman(price) ? price : null;
}
