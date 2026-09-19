import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { localizeCatalogText, localizeValue } from '@/lib/utils/catalogI18n';
import { localizedFactoryName } from '@/lib/utils/factoryNames';
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
  kind,
}: {
  title: string;
  facets: readonly Facet[];
  href: (slug: string) => string;
  /** The facet this page already IS — rendered as plain text, not a self-link. */
  activeSlug?: string;
  /** Unique per rail on the page — two rails share a page, so a fixed id would
   *  produce duplicate ids and an ambiguous `aria-labelledby`. */
  id: string;
  /** What the facets ARE, so the label is translated the right way: a size
   *  gets Latin digits / unit words, a mill gets its Latin name. */
  kind: 'size' | 'factory';
}) {
  const locale = useLocale();
  if (facets.length === 0) return null;
  const shown = (label: string) =>
    kind === 'size' ? localizeCatalogText(label, locale) : localizedFactoryName(label, locale);
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
                {shown(f.label)}
                <span className={styles.count}>{localizeValue(f.count, locale)}</span>
              </span>
            ) : (
              <Link className={styles.item} href={href(f.slug)}>
                {shown(f.label)}
                <span className={styles.count}>{localizeValue(f.count, locale)}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
