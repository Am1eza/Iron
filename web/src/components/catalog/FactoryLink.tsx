import Link from 'next/link';
import { routes } from '@/lib/routes';
import { factoryFacetSlug } from '@/lib/utils/catalogFacets';
import styles from './FactoryLink.module.css';

/** What a row shows when the mill is not recorded. Not a place — nothing to link to. */
export const UNKNOWN_FACTORY = 'نامشخص';

/**
 * A mill name, as a link to that mill's page within a category —
 * `/prices/{category}/factory/{factory}`.
 *
 * This started life as `FactoryCell` inside PriceTable (US-02.x, PR #198) and
 * was only ever a price-table thing, which left the same mill name rendering
 * as dead text everywhere else it appears: the homepage category flyout, the
 * /prices hub summary, the featured-prices table, search results, a SKU's own
 * spec list, the bulk-quote comparison. A visitor who has just read
 * «ذوب‌آهن اصفهان» in a comparison and wants everything that mill makes had no
 * way through from any of those. Extracted here so there is one answer to
 * "what happens when you click a factory name", and it is the same answer
 * everywhere.
 *
 * `categorySlug` must be the ROW'S OWN category, not the page's: a cross-listed
 * SKU shown under `/prices/steel` still lives in `sheet`, and it is the home
 * category whose facet page is guaranteed to contain it. `PriceRow.categoryId`
 * carries the slug (see catalogRepo's DTO note), which is what callers pass.
 *
 * A row with no mill has no page to point at — the facet route `notFound()`s an
 * empty facet — so it stays exactly the plain text it was.
 */
export function FactoryLink({
  categorySlug,
  factory,
  className,
  /** Perf audit: PriceTable renders one of these per row (up to ~186 on the
   *  largest sub-category today) — the same repeated handful of mill names,
   *  each independently triggering Next.js's viewport-prefetch. Every other
   *  call site (nav flyout, /prices hub, search, bulk-quote, a SKU's own spec
   *  list) renders this once or a handful of times, where prefetching is
   *  still worth it, so this is an explicit per-call opt-out rather than a
   *  new default that would silently change those too. */
  prefetch = true,
}: {
  categorySlug: string;
  factory?: string | null;
  className?: string;
  prefetch?: boolean;
}) {
  const name = factory?.trim();
  if (!name || name === UNKNOWN_FACTORY) return <>{UNKNOWN_FACTORY}</>;
  return (
    <Link
      href={routes.categoryByFactory(categorySlug, factoryFacetSlug(name))}
      className={className ?? styles.link}
      prefetch={prefetch}
    >
      {name}
    </Link>
  );
}
