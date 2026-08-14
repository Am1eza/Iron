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
 */

/** Categories whose `size` column holds a thickness. Only ورق today. */
const THICKNESS_CATEGORIES = new Set(['sheet']);

export const SIZE_LABEL = 'سایز';
export const THICKNESS_LABEL = 'ضخامت';

/** True when this category measures its products by thickness. */
export function usesThickness(categorySlug: string | null | undefined): boolean {
  return Boolean(categorySlug && THICKNESS_CATEGORIES.has(categorySlug));
}

/** «ضخامت» for ورق, «سایز» everywhere else (including unknown/mixed lists). */
export function sizeLabel(categorySlug: string | null | undefined): string {
  return usesThickness(categorySlug) ? THICKNESS_LABEL : SIZE_LABEL;
}
