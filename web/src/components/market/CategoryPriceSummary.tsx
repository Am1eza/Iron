'use client';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { formatToman, formatMovement, priceHiddenLabelLocalized, localizeDigits } from '@/lib/utils/format';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { Category, PriceRow } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { FactoryLink } from '@/components/catalog/FactoryLink';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryPriceSummary.module.css';

/**
 * The /prices hub's actual content: one live headline price per product
 * category, in one compact table.
 *
 * The hub used to render six میلگرد rows and nothing else — a thin snippet on
 * the site's single highest-intent query («قیمت روز آهن»), where the visitor's
 * question is "what do all the main sections cost today", not "show me rebar".
 * Every row here is a real SKU with a real admin-entered price, linking both
 * to that SKU and to the category's full table, so the page answers the query
 * on its own and still routes deeper.
 *
 * A category whose headline price has gone stale-hidden still appears, showing
 * «تماس بگیرید» — omitting it would silently misrepresent the catalogue.
 */
export function CategoryPriceSummary({
  rows,
  categories,
}: {
  rows: PriceRow[];
  categories: Category[];
}) {
  const t = useTranslations('categoryPriceSummary');
  const tPriceHidden = useTranslations('common.priceHidden');
  const locale = useLocale() as AppLocale;
  if (rows.length === 0) return null;
  // `r.name` (the SKU's own name) has no sub-category entity available at
  // this call site (only full categories are passed in) — `getLocalizedSkuName`
  // needs both to compose, so this stays fa, same documented exception as
  // FavoritesList/FeaturedPrices.
  const catMap = new Map(categories.map((c) => [c.slug, c]));
  const labelled = rows.map((r) => {
    const cat = catMap.get(r.categoryId);
    return { row: r, category: cat ? getLocalizedName(cat, locale) : r.categoryId };
  });

  return (
    <section className={styles.section} aria-labelledby="summary-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="summary-title" className={styles.title}>
            {t('title')}
          </h2>
        </div>
      </header>

      <div className={styles.tableWrap} role="region" aria-label={t('title')} tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className={styles.caption}>{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('col.category')}</th>
              <th scope="col">{t('col.headlineProduct')}</th>
              <th scope="col">{t('col.size')}</th>
              <th scope="col">{t('col.factory')}</th>
              <th scope="col" className={styles.num}>
                {t('col.price')}
              </th>
              <th scope="col" className={styles.num}>
                {t('col.movement')}
              </th>
              <th scope="col">{t('col.deliveryTime')}</th>
              <th scope="col" className={styles.action}>
                <span className="visually-hidden">{t('col.fullTable')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {labelled.map(({ row: r, category }) => {
              const up = r.current.movementDir === 'up';
              const down = r.current.movementDir === 'down';
              return (
                <tr key={r.id}>
                  <th scope="row" className={styles.name}>
                    <Link href={routes.category(r.categoryId)} className={styles.catLink}>
                      {category}
                    </Link>
                  </th>
                  <td>
                    <Link
                      href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                      className={styles.skuLink}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td>{r.size ? localizeDigits(r.size, locale) : t('unknown')}</td>
                  <td className={styles.muted}>
                    <FactoryLink categorySlug={r.categoryId} factory={r.factory} />
                  </td>
                  <td className={`${styles.num} ${styles.price}`}>
                    {priceHiddenLabelLocalized(r.current, locale, tPriceHidden) ??
                      formatToman(r.current.price, false, locale)}
                  </td>
                  <td
                    className={`${styles.num} ${up ? styles.up : down ? styles.down : styles.flat}`}
                  >
                    <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                    {formatMovement(r.current.movementPct, locale)}
                  </td>
                  <td className={styles.muted}>{r.current.deliveryTime || '—'}</td>
                  <td className={styles.action}>
                    <Link
                      href={routes.category(r.categoryId)}
                      className={styles.detail}
                      aria-label={t('fullTableOf', { category })}
                    >
                      <ChevronStartIcon size={16} className="icon--rtl" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback — the SAME rows, not a second data source; the
          table above is a 720px-wide horizontal scroller, which at the 320px
          WCAG 2.2 · 1.4.10 Reflow baseline would be 2.2× of sideways
          scrolling per price. Exactly one of the two is in the accessibility
          tree at any width (the other is `display:none`). */}
      <ul className={styles.cards}>
        {labelled.map(({ row: r, category }) => {
          const up = r.current.movementDir === 'up';
          const down = r.current.movementDir === 'down';
          return (
            <li key={r.id} className={styles.card}>
              <p className={styles.cardCat}>{category}</p>
              <Link
                href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                className={styles.cardLink}
              >
                <span className={styles.cardName}>{r.name}</span>
                <ChevronStartIcon size={16} className="icon--rtl" />
              </Link>
              <p className={`${styles.cardPrice} tnum`}>
                <span className={styles.price}>
                  {priceHiddenLabelLocalized(r.current, locale, tPriceHidden) ??
                    formatToman(r.current.price, false, locale)}
                </span>
                <span className={up ? styles.up : down ? styles.down : styles.flat}>
                  <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                  {formatMovement(r.current.movementPct, locale)}
                </span>
              </p>
              <dl className={styles.cardMeta}>
                <div>
                  <dt>{t('col.size')}</dt>
                  <dd className="tnum">{r.size ? localizeDigits(r.size, locale) : t('unknown')}</dd>
                </div>
                <div>
                  <dt>{t('col.factory')}</dt>
                  <dd>
                    <FactoryLink categorySlug={r.categoryId} factory={r.factory} />
                  </dd>
                </div>
                <div>
                  <dt>{t('col.deliveryTime')}</dt>
                  <dd>{r.current.deliveryTime || '—'}</dd>
                </div>
              </dl>
              <Link href={routes.category(r.categoryId)} className={styles.cardAll}>
                {t('fullTableOf', { category })}
                <ChevronStartIcon size={16} className="icon--rtl" />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>{t('note')}</p>
    </section>
  );
}
