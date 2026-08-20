/**
 * Per-category display labels for the shared SKU attribute columns.
 *
 * `skus.size` is one column for the whole catalog, but it does not mean the
 * same thing in every category. For میلگرد/تیرآهن/لوله/… it really is a
 * «سایز» (the market size number). For ورق it is a **thickness in
 * millimetres** — the trade calls it «ضخامت», never «سایز», and the owner
 * asked for the public and admin UI to say so. Nothing about the stored data
 * changes: this is a label, resolved from the CATEGORY the row is being shown
 * under, so the rename can never leak into a category that legitimately says
 * «سایز».
 *
 * Keyed on the category SLUG (`categories.slug`, e.g. `sheet`) — the same
 * identifier `PriceRow.categoryId` carries (catalogRepo's `toPriceRow` maps
 * the FK to the slug) and the same one the admin form's `parentCategory.slug`
 * has, so every caller can answer the question without a lookup.
 *
 * The same idea, one level deeper, drives the grade/standard column: تیرآهن
 * resolves it from the SUB-category slug too, because «گرید» is meaningless
 * there except on هاش سبک/هاش سنگین, where the meaningful value lives in a
 * different stored column (`skus.standard`) entirely.
 */

import type { PriceBasis, PriceUnit } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';

/** Categories whose `size` column holds a thickness. Only ورق today. */
const THICKNESS_CATEGORIES = new Set(['sheet']);

/** Categories that additionally carry a width×length. Only ورق today — a
 *  plate has three dimensions and `size` only holds the thickness. */
const DIMENSIONS_CATEGORIES = new Set(['sheet']);

/** تیرآهن sub-category slugs where «استاندارد» (`skus.standard`, e.g. HEA/HEB
 *  per DIN 1025) is the meaningful column. Everywhere else in تیرآهن the
 *  «گرید» column is unfilled noise the owner asked removed. */
const IBEAM_STANDARD_SUBS = new Set(['hash-sabok', 'hash-sangin']);

export const SIZE_LABEL = 'سایز';
export const THICKNESS_LABEL = 'ضخامت';
export const DIMENSIONS_LABEL = 'ابعاد';
export const GRADE_LABEL = 'گرید';
export const STANDARD_LABEL = 'استاندارد';

/** True when this category measures its products by thickness. */
export function usesThickness(categorySlug: string | null | undefined): boolean {
  return Boolean(categorySlug && THICKNESS_CATEGORIES.has(categorySlug));
}

/**
 * True when this category has a meaningful «ابعاد» (width×length) alongside
 * its thickness. Drives whether the column/field is OFFERED at all — every
 * other category never sees it, in the admin form or on the public table.
 */
export function usesDimensions(categorySlug: string | null | undefined): boolean {
  return Boolean(categorySlug && DIMENSIONS_CATEGORIES.has(categorySlug));
}

/** «ضخامت» for ورق, «سایز» everywhere else (including unknown/mixed lists). */
export function sizeLabel(categorySlug: string | null | undefined): string {
  return usesThickness(categorySlug) ? THICKNESS_LABEL : SIZE_LABEL;
}

/** The subset of a price row the grade/standard column reads. Deliberately
 *  structural rather than `PriceRow` so the admin tables can reuse it without
 *  carrying the public DTO. */
type GradeRow = { subCategoryId: string; grade?: string; standard?: string };

/**
 * Whether the grade/standard column renders AT ALL, given the page's category
 * and the currently-active sub-category filter (`null` = «همه», every
 * sub-category mixed into one table — that view keeps the column, because هاش
 * rows are present in it). Only تیرآهن ever hides it; every other category is
 * unaffected and always gets its «گرید» column exactly as before.
 */
export function usesGradeColumn(
  categorySlug: string | null | undefined,
  sub: string | null,
): boolean {
  if (categorySlug !== 'ibeam') return true;
  if (sub === null) return true;
  return IBEAM_STANDARD_SUBS.has(sub);
}

/**
 * Header label for that column. تیرآهن says «استاندارد» whenever the column is
 * shown at all (both the mixed «همه» table and the هاش-specific pages); every
 * other category keeps «گرید».
 */
export function gradeColumnLabel(categorySlug: string | null | undefined): string {
  return categorySlug === 'ibeam' ? STANDARD_LABEL : GRADE_LABEL;
}

/**
 * Per-row display value for the desktop table cell. تیرآهن هاش rows read
 * `standard` — the field that actually means DIN 1025 / HEA / HEB, and the one
 * the admin form already labels «استاندارد» — not `grade`, which is empty
 * across the whole category. تیرآهن rows OUTSIDE هاش can only be seen in the
 * mixed «همه» table (their own pages drop the column via `usesGradeColumn`),
 * and there the column simply does not apply to them: an em dash, not
 * «نامشخص» — «نامشخص» claims the value is unknown, a dash says it isn't a
 * property of this product at all.
 */
export function gradeColumnCell(
  categorySlug: string | null | undefined,
  row: GradeRow,
): string {
  if (categorySlug !== 'ibeam') return row.grade ?? 'نامشخص';
  if (IBEAM_STANDARD_SUBS.has(row.subCategoryId)) return row.standard ?? 'نامشخص';
  return '—';
}

/**
 * Same value for the compact mobile card, which by the established convention
 * of that card (see `dimensions`/`theoreticalWeightKg` in PriceTable) omits a
 * field entirely rather than printing a placeholder — a card is a summary, not
 * a spec sheet. Returns null when there's nothing worth a line.
 */
export function gradeColumnCard(
  categorySlug: string | null | undefined,
  row: GradeRow,
): { label: string; value: string } | null {
  const value =
    categorySlug === 'ibeam'
      ? IBEAM_STANDARD_SUBS.has(row.subCategoryId)
        ? row.standard
        : undefined
      : row.grade;
  return value ? { label: gradeColumnLabel(categorySlug), value } : null;
}

/**
 * The Persian noun for one `PriceUnit` — what `qty` COUNTS in.
 *
 * This existed as four hand-copied `Record<PriceUnit, string>` literals: the
 * cart, the admin lead drawer, the admin lead-item route and the پیش‌فاکتور.
 * Adding «متر مربع» meant editing all four and hoping none was missed — the
 * same shape of problem that once labelled every coupler line «متر» on a
 * customer's proforma. One table now, and the `Record` makes the compiler
 * demand a key for every future member. (`track/TrackLookup` keeps its own
 * switch on purpose; it renders `kg` as «تن».)
 */
export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * The Persian noun for one unit of a price basis — «کیلوگرم», «شاخه», … —
 * without the «تومان /» prefix. One table, so the row caption, the page-wide
 * note, the spec sheet's «واحد فروش» row and the وزن‌سنج summary cannot drift
 * into three different words for the same thing.
 *
 * Deliberately NOT `PRICE_UNIT_LABEL` above, even though five of six entries
 * coincide: `meter` is a unit and never a basis, `coil` is a basis and never a
 * unit, and collapsing them would re-conflate the two facts the `price_basis`
 * column exists to separate.
 */
const PRICE_BASIS_NOUN: Record<PriceBasis, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  coil: 'کلاف',
  sheet: 'برگ',
  piece: 'عدد',
  sqm: 'متر مربع',
};

/**
 * «کلاف ۱۵ متری» — the basis noun, qualified by the branch/coil length when
 * the catalog records one. A length is only ever appended to a basis that IS
 * a length of something; «کیلوگرم ۶ متری» is nonsense and cannot be produced
 * here even if a stray `branchLengthM` is set on a kg-priced row.
 */
export function priceBasisNoun(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  const b: PriceBasis = basis ?? 'kg';
  const noun = PRICE_BASIS_NOUN[b] ?? PRICE_BASIS_NOUN.kg;
  if ((b === 'branch' || b === 'coil') && branchLengthM) {
    return `${noun} ${toPersianDigits(branchLengthM)} متری`;
  }
  return noun;
}

/**
 * What a price on a catalog row is denominated in — «تومان / کیلوگرم».
 *
 * This used to key off `unit` and hard-code the invariant that everything
 * except `piece` is per kilogram. That was false for 55 live rows: a لوله مسی
 * whose price is for a whole 15-metre coil rendered «۱۶٬۴۹۲٬۳۸۰ تومان /
 * کیلوگرم», which to a real buyer reads as a broken site. The denomination is
 * now a stored column (`PriceBasis`), so this just reads it.
 */
export function priceUnitCaption(
  basis: PriceBasis | null | undefined,
  branchLengthM?: number | null,
): string {
  return `تومان / ${priceBasisNoun(basis, branchLengthM)}`;
}

/**
 * The one price basis every given row shares, or null when they disagree.
 *
 * Backs the page-wide «قیمت‌ها … برای هر کیلوگرم است» note: a table mixing
 * kg-priced and عدد-priced products has to drop that sentence and let each
 * row caption itself rather than print a blanket claim that is wrong for some
 * of its own rows. Rows agreeing on the basis but not on the length are still
 * "one basis" — the note then omits the length rather than picking one.
 */
export function singlePriceBasis(
  rows: readonly { priceBasis?: PriceBasis | null; branchLengthM?: number | null }[],
): { basis: PriceBasis; branchLengthM?: number } | null {
  if (rows.length === 0) return { basis: 'kg' };
  const bases = new Set(rows.map((r) => r.priceBasis ?? 'kg'));
  if (bases.size !== 1) return null;
  const basis = [...bases][0] as PriceBasis;
  const lengths = new Set(rows.map((r) => r.branchLengthM ?? null));
  const only = lengths.size === 1 ? [...lengths][0] : null;
  return only ? { basis, branchLengthM: only } : { basis };
}
