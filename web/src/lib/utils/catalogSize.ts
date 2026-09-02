import { normalizeDigits } from './format';

/** Numeric value of the vulgar fractions buyers and admins use in inch sizes. */
const VULGAR_FRACTIONS: Readonly<Record<string, number>> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

/**
 * Every numeric axis in a catalog size, in the order it is written.
 *
 * Catalog sizes are measurements, not integers. They include Persian digits,
 * decimal gauges, mixed inch fractions and two- or three-axis sections such
 * as «۶۰×۶۰×۶». Keeping the full vector is what prevents a
 * dimension from being collapsed to 60606 (digit stripping) or merely 60
 * (leading-number parsing). Callers that need ordering compare the vectors;
 * callers that need one section dimension can deliberately choose an axis.
 */
export function catalogSizeNumbers(input: string | null | undefined): number[] {
  if (!input) return [];
  let text = normalizeDigits(input)
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
    .replace(/(?<=\d)[,،](?=\d)/g, '.');

  // A mixed fraction is ONE measurement: «۱½» is 1.5, not the two
  // axes [1, 0.5]. Pure vulgar fractions are handled by the second pass.
  text = text.replace(/(\d+(?:\.\d+)?)([¼½¾⅓⅔⅛⅜⅝⅞])/g, (_, whole: string, glyph: string) =>
    String(Number(whole) + VULGAR_FRACTIONS[glyph]!),
  );
  text = text.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (glyph) => String(VULGAR_FRACTIONS[glyph]!));

  const tokens = text.match(/\d+\s*\/\s*\d+|\d+(?:\.\d+)?/g) ?? [];
  return tokens
    .map((token) => {
      const fraction = token.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (fraction) {
        const denominator = Number(fraction[2]);
        return denominator === 0 ? Number.NaN : Number(fraction[1]) / denominator;
      }
      return Number(token);
    })
    .filter((value) => Number.isFinite(value));
}

/** Normalize every common dimension separator without changing the numbers. */
export function normalizeDimensionToken(input: string): string {
  return normalizeDigits(input).replace(/٫/g, '.').replace(/[xX*]/g, '×').replace(/\s+/g, '');
}

/**
 * Dimension-aware ascending comparison for catalog sizes.
 *
 * Axes compare lexicographically: 60×60×6 follows 60×60×5, and 80×40
 * follows 60×60. Non-numeric labels sort last and use Persian collation as
 * a deterministic fallback. This also preserves ordinary scalar ordering and
 * understands 1½-inch values.
 */
export function compareCatalogSizes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = catalogSizeNumbers(a);
  const right = catalogSizeNumbers(b);
  const width = Math.max(left.length, right.length);
  for (let i = 0; i < width; i++) {
    const av = left[i] ?? Number.POSITIVE_INFINITY;
    const bv = right[i] ?? Number.POSITIVE_INFINITY;
    if (av !== bv) return av - bv;
  }
  return (a ?? '').localeCompare(b ?? '', 'fa', { numeric: true });
}
