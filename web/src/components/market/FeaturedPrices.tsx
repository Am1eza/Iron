'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { formatToman, formatMovement, priceHiddenLabelLocalized, localizeDigits } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { FactoryLink } from '@/components/catalog/FactoryLink';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './FeaturedPrices.module.css';

/**
 * /prices hub price preview — a compact «Datasheet» taste so Pros see live prices
 * above the fold. Persian numerals + tabular figures; نوسان is color + arrow coded
 * (gain/loss). `rows` is required (server-fetched, live-aware) — a mock default
 * here previously meant the sole caller (which passed no prop) always rendered
 * fake rebar rows, even in production.
 *
 * `r.name` stays fa: only bare `PriceRow`s are passed in here, no category/
 * sub-category entity to compose a translated name from — same documented
 * exception as the account section's FavoritesList.
 */
export function FeaturedPrices({ rows }: { rows: PriceRow[] }) {
  const t = useTranslations('featuredPrices');
  const tPriceHidden = useTranslations('common.priceHidden');
  const locale = useLocale() as AppLocale;
  return (
    <section className={styles.section} aria-labelledby="featured-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="featured-title" className={styles.title}>
            {t('title')}
          </h2>
        </div>
        <Link href={routes.category('rebar')} className={styles.all}>
          {t('fullTable')}
          <ChevronStartIcon size={16} className="icon--rtl" />
        </Link>
      </header>

      <div className={styles.tableWrap} role="region" aria-label={t('title')} tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">{t('title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('col.product')}</th>
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
                <span className="visually-hidden">{t('col.details')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const up = r.current.movementDir === 'up';
              const down = r.current.movementDir === 'down';
              return (
                <tr key={r.id}>
                  <th scope="row" className={styles.name}>
                    {r.name}
                  </th>
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
                  <td className={styles.muted}>{r.current.deliveryTime}</td>
                  <td className={styles.action}>
                    <Link
                      href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                      className={styles.detail}
                      aria-label={t('detailsOf', { name: r.name })}
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

      {/* Mobile card fallback — the SAME rows, not a second data source. The
          table above is `min-inline-size: 640px` inside a horizontal scroller,
          which at the 320px baseline WCAG 2.2 · 1.4.10 Reflow is measured
          against means 2.2× of sideways scrolling to read a single price. The
          table→card conversion at 767px is the pattern PriceTable already
          uses; this brings the /prices hub preview in line with it. Exactly
          one of the two is in the accessibility tree at any width (the hidden
          one is `display:none`, not visually-hidden), so nothing is
          duplicated for a screen reader. */}
      <ul className={styles.cards}>
        {rows.map((r) => {
          const up = r.current.movementDir === 'up';
          const down = r.current.movementDir === 'down';
          return (
            <li key={r.id} className={styles.card}>
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
                <span className={`${up ? styles.up : down ? styles.down : styles.flat}`}>
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
                  <dd>{r.current.deliveryTime}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>{t('note')}</p>
    </section>
  );
}
