/**
 * Facet slugs for the per-factory and per-size landing pages
 * (`/prices/[category]/factory/[factory]`, `/prices/[category]/size/[size]`).
 *
 * Why this is not just `slugify`
 * ------------------------------
 * `skus.factory` and `skus.size` are free-text columns, not taxonomy rows —
 * there is deliberately no `sub_categories`-style table behind them (a factory
 * name is not a product type, and inserting one as a sub-category would put
 * «ذوب‌آهن اصفهان» in the same tab bar as «میلگرد آجدار»). So the URL segment
 * has to be DERIVED from the stored string, and derived the same way in three
 * places that must never disagree: the page (which resolves the segment back
 * to rows), the sitemap (which publishes it), and `publicCatalogPaths` (whose
 * omission would make middleware hard-404 a page that has real content).
 *
 * `slugify` alone is wrong for sizes: it drops any character it doesn't map,
 * so «۱ اینچ», «۱¼ اینچ» and «۱½ اینچ» — three different, separately-priced
 * لوله sizes that all exist in the catalog today — every one of them collapsed
 * to `1-aynch`. Three products, one URL. `sizeFacetSlug` expands the vulgar
 * fractions (and the ASCII `/` form the admin also types) first, so those
 * become `1-aynch`, `1-1-4-aynch`, `1-1-2-aynch`.
 *
 * When two DIFFERENT stored strings still share a slug, the facet carries both
 * (`values`) and the page matches all of them. That is the only coherent
 * behaviour for a slug-addressed URL — but it IS a silent merge, so
 * `collidingFacets` exists to surface it rather than let it pass unnoticed.
 * As of this writing no category has a collision in either dimension.
 */
import { slugify } from './slugify';
import { normalizeDigits } from './format';

/** Vulgar fractions → an unambiguous, sluggable ASCII form. */
const FRACTIONS: Record<string, string> = {
  '¼': '-1-4',
  '½': '-1-2',
  '¾': '-3-4',
  '⅓': '-1-3',
  '⅔': '-2-3',
  '⅛': '-1-8',
  '⅜': '-3-8',
  '⅝': '-5-8',
  '⅞': '-7-8',
};

/** URL segment for a stored `skus.factory` value. Plain transliteration —
 *  same convention the SKU slugs themselves already use («کویر کاشان» →
 *  `kvyr-kashan`), so the facet URL reads like the SKU URLs beside it. */
export function factoryFacetSlug(factory: string): string {
  return slugify(factory);
}

/** URL segment for a stored `skus.size` value. See the module comment for why
 *  this is not `slugify` — «۱½ اینچ» and «۱ اینچ» must not share a URL. */
export function sizeFacetSlug(size: string): string {
  const expanded = [...size].map((ch) => FRACTIONS[ch] ?? ch).join('').replace(/\//g, '-');
  return slugify(expanded);
}

export type Facet = {
  /** The URL segment. */
  slug: string;
  /** What the page prints — the most common stored spelling for this slug. */
  label: string;
  /** Every stored value that maps to `slug`. Usually one. */
  values: string[];
  /** Active SKUs in this category carrying one of `values`. */
  count: number;
};

type FacetRow = { factory?: string | null; size?: string | null };

function group(
  rows: readonly FacetRow[],
  pick: (r: FacetRow) => string | null | undefined,
  toSlug: (v: string) => string,
): Map<string, Map<string, number>> {
  const bySlug = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const raw = pick(row)?.trim();
    if (!raw) continue;
    const slug = toSlug(raw);
    // An all-punctuation value slugifies to '' — it has no URL, so it gets no
    // page rather than one at `/prices/rebar/factory/`.
    if (!slug) continue;
    const variants = bySlug.get(slug) ?? new Map<string, number>();
    variants.set(raw, (variants.get(raw) ?? 0) + 1);
    bySlug.set(slug, variants);
  }
  return bySlug;
}

function toFacets(bySlug: Map<string, Map<string, number>>): Facet[] {
  return [...bySlug].map(([slug, variants]) => {
    const sorted = [...variants].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'));
    return {
      slug,
      label: sorted[0]![0],
      values: sorted.map(([v]) => v),
      count: sorted.reduce((n, [, c]) => n + c, 0),
    };
  });
}

/**
 * Every factory that has at least one active SKU in this row set, busiest
 * first. Busiest-first (not alphabetical, and NOT the admin's `factory_order`)
 * because this list is a link rail and a sitemap source, where the page most
 * worth crawling should come first; the admin's ordering governs the price
 * TABLE and is applied there, unchanged.
 */
export function factoryFacets(rows: readonly FacetRow[]): Facet[] {
  return toFacets(group(rows, (r) => r.factory, factoryFacetSlug)).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fa'),
  );
}

/** Every size with at least one active SKU, in ascending numeric order —
 *  «۸، ۱۰، ۱۲…», the order the trade reads a size list in. Sizes that are not
 *  a plain number («۱۰۰×۱۰۰», «۲½ اینچ») sort on their leading number, which
 *  is the one that varies within a category. */
export function sizeFacets(rows: readonly FacetRow[]): Facet[] {
  return toFacets(group(rows, (r) => r.size, sizeFacetSlug)).sort(
    (a, b) => sizeSortKey(a.label) - sizeSortKey(b.label) || a.label.localeCompare(b.label, 'fa'),
  );
}

/** Leading numeric value of a size label, or +∞ when it has none (so unparseable
 *  sizes sort last instead of silently leading the list as NaN would). */
function sizeSortKey(label: string): number {
  const n = Number.parseFloat(normalizeDigits(label).replace(',', '.'));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Facets whose slug is shared by more than one stored spelling — a silent
 *  merge of two products into one URL. Surfaced for the SEO audit page and
 *  the tests; never used to suppress a page (a merged page is still better
 *  than no page, and dropping it would 404 a URL the sitemap advertises). */
export function collidingFacets(facets: readonly Facet[]): Facet[] {
  return facets.filter((f) => f.values.length > 1);
}
