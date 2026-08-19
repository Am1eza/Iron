import Link from 'next/link';
import { toPersianDigits } from '@/lib/utils/format';
import type { Facet } from '@/lib/utils/catalogFacets';
import styles from './FacetRail.module.css';

/**
 * The «بر اساس کارخانه» / «بر اساس سایز» link rail.
 *
 * Its job is crawlability, not decoration: the per-factory and per-size
 * landing pages exist to rank for narrow queries, and a page reachable only
 * from `sitemap.xml` is an orphan — search engines discover it late, weight it
 * low, and AI answer engines (which follow links far more than they parse
 * sitemaps) may never see it at all. This rail is the internal link graph that
 * makes them first-class.
 *
 * Real `<a>` elements via `next/link`, never buttons — `Chip` renders a
 * `<button>` and a crawler cannot follow one.
 */
export function FacetRail({
  title,
  facets,
  href,
  activeSlug,
  id,
}: {
  title: string;
  facets: readonly Facet[];
  href: (slug: string) => string;
  /** The facet this page already IS — rendered as plain text, not a self-link. */
  activeSlug?: string;
  /** Unique per rail on the page — two rails share a page, so a fixed id would
   *  produce duplicate ids and an ambiguous `aria-labelledby`. */
  id: string;
}) {
  if (facets.length === 0) return null;
  return (
    <nav className={styles.rail} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      <ul className={styles.list}>
        {facets.map((f) => (
          <li key={f.slug}>
            {f.slug === activeSlug ? (
              <span className={`${styles.item} ${styles.active}`} aria-current="page">
                {f.label}
                <span className={styles.count}>{toPersianDigits(f.count)}</span>
              </span>
            ) : (
              <Link className={styles.item} href={href(f.slug)}>
                {f.label}
                <span className={styles.count}>{toPersianDigits(f.count)}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
