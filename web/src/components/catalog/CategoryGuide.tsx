import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import type { Category, PriceBasis, PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import type { AppLocale } from '@/i18n/config';
import { getArticlesPageByCategory } from '@/lib/server/catalog';
import { subSummaries, sizeSummaries, type RangeSummary } from '@/lib/seo/hubSummary';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { localizeValue } from '@/lib/utils/catalogI18n';
import {
  getLocalizedName,
  getLocalizedBasisNoun,
  getLocalizedArticleTitle,
  getLocalizedArticleExcerpt,
} from '@/lib/utils/localizedNames';
import styles from './CategoryGuide.module.css';

/**
 * The part of a category HUB that is not the table: the price range of each
 * type, the most-listed sizes (each a link into that size's own page) and the
 * articles filed under the category.
 *
 * Why it exists: the hubs sit around position 75-90 for «قیمت پروفیل», «قیمت
 * تیرآهن», «قیمت میلگرد», while every page in the top ten carries several summary
 * tables (1,400-9,700 words against ~540 here) and a real internal-link
 * neighbourhood. This adds the same kind of content without inventing any of
 * it: every figure is computed from the rows the table renders (`hubSummary`),
 * every link goes to a page that exists, and the articles are the ones an
 * editor already filed under this category.
 *
 * Each block renders only when it has something to say, so a small category
 * does not get an empty heading.
 */
export async function CategoryGuide({
  category,
  categorySlug,
  rows,
  subs,
  locale,
}: {
  category: Category;
  categorySlug: string;
  rows: readonly PriceRow[];
  subs: readonly SubCat[];
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: 'pricesGuide' });
  const catName = getLocalizedName(category, locale);
  const bySub = subSummaries(rows, subs);
  const bySize = sizeSummaries(rows, 12);
  const { articles } = await getArticlesPageByCategory(category.id, 1, 4);

  const showSubs = bySub.length >= 2;
  const showSizes = bySize.length >= 3;
  if (!showSubs && !showSizes && articles.length === 0) return null;

  const noun = (basis: PriceBasis) =>
    locale === 'fa' ? priceBasisNoun(basis) : getLocalizedBasisNoun(basis, locale);
  const money = (v: number) => formatToman(v, false, locale);
  const count = (n: number) => localizeDigits(n, locale);
  const range = (s: RangeSummary) =>
    s.min === s.max ? money(s.min) : t('range', { min: money(s.min), max: money(s.max) });
  const dominant = (list: readonly RangeSummary[]): PriceBasis => {
    const tally = new Map<PriceBasis, number>();
    for (const s of list) tally.set(s.basis, (tally.get(s.basis) ?? 0) + s.count);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'kg';
  };
  // A row quoted per something other than the column's basis says so itself.
  const cell = (s: RangeSummary, columnBasis: PriceBasis) => (
    <>
      {range(s)}
      {s.basis !== columnBasis ? <span className={styles.unit}> / {noun(s.basis)}</span> : null}
    </>
  );

  const subBasis = dominant(bySub);
  const sizeBasis = dominant(bySize);

  return (
    <div className={styles.guide}>
      {showSubs && (
        <section className={styles.block} aria-labelledby="guide-subs">
          <h2 id="guide-subs" className={styles.title}>
            {t('subTitle', { category: catName })}
          </h2>
          <p className={styles.lead}>{t('subLead', { category: catName })}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('colType')}</th>
                  <th scope="col">{t('colItems')}</th>
                  <th scope="col">{t('colMills')}</th>
                  <th scope="col">{t('colRange', { unit: noun(subBasis) })}</th>
                </tr>
              </thead>
              <tbody>
                {bySub.map((s) => {
                  const sub = subs.find((x) => x.slug === s.slug)!;
                  return (
                    <tr key={s.slug}>
                      <th scope="row">
                        <Link className={styles.link} href={routes.subCategory(categorySlug, s.slug)}>
                          {getLocalizedName(sub, locale)}
                        </Link>
                      </th>
                      <td>{count(s.count)}</td>
                      <td>{s.mills > 0 ? count(s.mills) : '-'}</td>
                      <td>{cell(s, subBasis)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showSizes && (
        <section className={styles.block} aria-labelledby="guide-sizes">
          <h2 id="guide-sizes" className={styles.title}>
            {t('sizeTitle', { category: catName })}
          </h2>
          <p className={styles.lead}>{t('sizeLead')}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('colSize')}</th>
                  <th scope="col">{t('colItems')}</th>
                  <th scope="col">{t('colMills')}</th>
                  <th scope="col">{t('colRange', { unit: noun(sizeBasis) })}</th>
                </tr>
              </thead>
              <tbody>
                {bySize.map((s) => (
                  <tr key={s.slug}>
                    <th scope="row">
                      <Link className={styles.link} href={routes.categoryBySize(categorySlug, s.slug)}>
                        {localizeValue(s.label, locale)}
                      </Link>
                    </th>
                    <td>{count(s.count)}</td>
                    <td>{s.mills > 0 ? count(s.mills) : '-'}</td>
                    <td>{cell(s, sizeBasis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {articles.length > 0 && (
        <section className={styles.block} aria-labelledby="guide-articles">
          <h2 id="guide-articles" className={styles.title}>
            {t('articlesTitle', { category: catName })}
          </h2>
          <ul className={styles.articles}>
            {articles.map((a) => {
              const excerpt = getLocalizedArticleExcerpt(a, locale);
              return (
                <li key={a.id}>
                  <Link
                    className={styles.link}
                    href={a.type === 'news' ? routes.news(a.slug) : routes.blog(a.slug)}
                  >
                    {getLocalizedArticleTitle(a, locale)}
                  </Link>
                  {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
