/**
 * When a `/prices` URL may be advertised to Google — the whole rule, in one
 * place, read by both the pages (`robots`) and `sitemap.ts`.
 *
 * It lives in a private (`_`-prefixed) App Router folder so Next never routes
 * it, next to the pages it governs rather than in `lib/`, because the pages
 * and the sitemap disagreeing about this is exactly the failure it exists to
 * prevent: a page that says `noindex` while the sitemap still submits it is a
 * contradiction Google reports as «Submitted URL marked noindex», and a page
 * that is missing from the sitemap while it is perfectly indexable just loses
 * discovery. One predicate, two callers.
 *
 * ## The rule
 *
 * A `/prices` URL is advertised — indexable AND in the sitemap — if and only
 * if the page has content of its own that answers the query it would rank
 * for. That splits the tree in two, and the split is deliberately asymmetric:
 *
 * **1. Taxonomy pages (category, sub-category) exist to publish a price
 * TABLE. With zero rows there is no table and no list — the page is a
 * promise with nothing behind it.** Measured on production 1405/06/09: 17 of
 * 85 sub-categories (20 %) held zero rows, every one of them answering 200
 * with no `noindex`, every one in the sitemap, and every one shipping a meta
 * description that promised «جدول قیمت روز … با نوسان، وزن شاخه، استاندارد و
 * زمان تحویل». `/prices/steel/mesh` is the canonical example. That is a
 * soft-404, and Google grades soft-404s at the host level, so 17 pages put
 * the whole domain's quality signal at risk. → `noindex, follow` and omitted
 * from the sitemap.
 *
 * `follow`, not `nofollow`: the page still carries breadcrumbs and the
 * category rail, and those links go to pages that ARE worth crawling.
 *
 * **2. SKU pages exist to answer "what is this product, and what does it
 * cost". Without a published price they still carry the product's identity,
 * standard, size, grade, theoretical weight and mill — real content, and the
 * entry point of the funnel this business actually runs on** (CLAUDE.md §1:
 * lead-gen, the sale closes on the phone; the page's own CTA is «تماس
 * بگیرید»). → **stays indexable**. What must change is the CLAIM: the title
 * said «قیمت روز تیرآهن هاش سنگین (HEB) ۲۴» and the description said «تماس
 * بگیرید», so the snippet promised a number the page does not have. Those
 * pages now ask for an enquiry instead of announcing a price, and the sitemap
 * advertises them as weekly rather than hourly, because a page with no price
 * does not change hourly and saying it does spends crawl budget that the
 * priced 553 pages need.
 *
 * Do NOT "simplify" this by noindexing both halves. That would pull 195 of
 * 748 product pages — 26 % of the catalog, 77 of them the whole فلزات رنگی
 * category — out of search, on a signal (`priceHidden`) that flips back the
 * moment an admin types a number. Emptiness is structural; a missing price is
 * a Tuesday.
 *
 * Both directions are automatic and need no deploy: the sitemap is
 * `force-dynamic` (see its header) and the pages revalidate every 300s, so
 * adding the first SKU to an empty sub-category re-admits it, and deleting
 * the last one withdraws it.
 */

/** The minimum a caller must know about a row to apply the rule. */
export type IndexableRow = {
  subCategoryId: string;
  current?: { priceHidden?: boolean };
};

/**
 * A category or sub-category page's own rows, from the row set the page
 * itself renders.
 *
 * `rows` is always the whole CATEGORY's set (`getRows`), never a second
 * query: `PriceRow.subCategoryId` is the joined `sub_categories.slug`, so
 * this filter is exactly `getSubRows(category, sub)` — the query the
 * sub-category page runs — without the round trip. The sitemap depends on
 * that equivalence to decide 85 sub-categories from 8 queries.
 */
export function rowsInSubCategory<T extends IndexableRow>(
  rows: readonly T[],
  subSlug: string,
): T[] {
  return rows.filter((r) => r.subCategoryId === subSlug);
}

/**
 * Rule 1. A taxonomy page with no rows is a soft-404 and must be neither
 * indexed nor submitted.
 */
export function taxonomyIsIndexable(rowCount: number): boolean {
  return rowCount > 0;
}

/**
 * Rule 2. A product page is indexable whether or not it carries a price —
 * see the header for why this is not symmetric with rule 1.
 *
 * A constant, not a `true` literal at the call sites, so that the decision
 * is stated once and shows up in a grep for this module.
 */
export function skuIsIndexable(): boolean {
  return true;
}

/**
 * Does this SKU publish a number today?
 *
 * `priceHidden` is set by `catalogRepo.toPriceRow` for BOTH causes — no price
 * row was ever written, and a price that has aged past
 * `PRICE_STALE_HIDE_AFTER_DAYS` — because from the page's point of view they
 * are the same fact: there is nothing to show. The public surfaces already
 * render «تماس بگیرید» off this flag; the metadata now agrees with them.
 */
export function skuHasPublishedPrice(row: { current?: { priceHidden?: boolean } }): boolean {
  return !row.current?.priceHidden;
}

/**
 * Sitemap hints for a SKU entry.
 *
 * `hourly` is a statement about how often the page's content changes, and for
 * a price-less page it is simply false — nothing on it moves until an admin
 * enters a price, at which point the entry's `lastModified` changes and the
 * crawler is told properly. Under-claiming here concentrates the crawl budget
 * on the pages that really do change intraday.
 */
export function skuSitemapHints(hasPrice: boolean): {
  changeFrequency: 'hourly' | 'weekly';
  priority: number;
} {
  return hasPrice
    ? { changeFrequency: 'hourly', priority: 0.65 }
    : { changeFrequency: 'weekly', priority: 0.5 };
}
