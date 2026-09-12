'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import type { PriceRow, Article, Category } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { formatToman, priceHiddenLabelLocalized, localizeDigits } from '@/lib/utils/format';
import { priceUnitCaption } from '@/lib/utils/catalogLabels';
import { getLocalizedName, getLocalizedSkuName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { Heading, Text, EmptyState, MovementBadge, Badge } from '@/components/ui';
import { ArticleCard } from '@/components/content/ArticleCard';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { SearchIcon, TagIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { SearchBar } from '@/components/layout/SearchBar';
import { SearchEmptyState } from './SearchEmptyState';
import resultStyles from '@/components/search/SearchResults.module.css';

/** Max items shown per group before we add a «more results» note — mirrors
 *  `page.tsx`'s own `GROUP_CAP`, kept in sync by hand since it's a display
 *  constant, not data. */
const GROUP_CAP = 24;

export type TypeFilter = 'sku' | 'category' | 'article';
export type SortKey = 'relevance' | 'price' | 'factory';
const TYPE_FILTERS: TypeFilter[] = ['sku', 'category', 'article'];
const SORT_KEYS: SortKey[] = ['relevance', 'price', 'factory'];

export type ProductHit = {
  row: PriceRow;
  category: Category | undefined;
  subCategory: SubCat | undefined;
};
export type CatWithCount = { cat: Category; count: number };

/**
 * The translated half of the search page — everything below the
 * breadcrumbs. `page.tsx` (a Server Component, needed for `metadata` and
 * the actual DB search) stays fa-only for its own shell text, matching the
 * SSR-shell exception every other page in this app uses; this component
 * does the real work of rendering results in the visitor's locale. Data
 * only, no functions — sort/filter/pagination are plain `?query=` links,
 * not client state (see `page.tsx`'s `sortProductHits` comment for why).
 */
export function SearchPageContent({
  emptyQuery,
  q,
  activeType,
  sort,
  totalHits,
  productHits,
  categoryHits,
  articleHits,
  popularCategories,
}: {
  emptyQuery: boolean;
  q: string;
  activeType: TypeFilter | undefined;
  sort: SortKey;
  totalHits: number;
  productHits: ProductHit[];
  categoryHits: CatWithCount[];
  articleHits: Article[];
  popularCategories: CatWithCount[];
}) {
  const t = useTranslations('search');
  const locale = useLocale() as AppLocale;

  if (emptyQuery) {
    return (
      <>
        <Header initial="" t={t} />
        <EmptyState
          size="section"
          glyph={<SearchIcon size={44} />}
          headline={t('emptyQueryHeadline')}
          body={t('emptyQueryBody')}
        />
        <PopularCategories items={popularCategories} t={t} locale={locale} />
      </>
    );
  }

  const filteredCount =
    activeType === 'sku'
      ? productHits.length
      : activeType === 'category'
        ? categoryHits.length
        : activeType === 'article'
          ? articleHits.length
          : 0;

  return (
    <>
      <Header initial={q} t={t} />

      {totalHits === 0 ? (
        <>
          <SearchEmptyState q={q} />
          <PopularCategories items={popularCategories} t={t} locale={locale} />
        </>
      ) : (
        <>
          <p className={resultStyles.summary}>
            {t('resultsSummary', { count: localizeDigits(totalHits, locale), q })}
          </p>
          <TypeFilters
            q={q}
            active={activeType}
            counts={{ sku: productHits.length, category: categoryHits.length, article: articleHits.length }}
            t={t}
            locale={locale}
          />
        </>
      )}

      {(!activeType || activeType === 'sku') && productHits.length > 0 ? (
        <ProductGroup hits={productHits} q={q} activeType={activeType} sort={sort} t={t} locale={locale} />
      ) : null}

      {(!activeType || activeType === 'category') && categoryHits.length > 0 ? (
        <CategoryGroup cats={categoryHits} t={t} locale={locale} />
      ) : null}

      {(!activeType || activeType === 'article') && articleHits.length > 0 ? (
        <ArticleGroup items={articleHits} t={t} locale={locale} />
      ) : null}

      {activeType && filteredCount === 0 ? (
        <p className={resultStyles.summary}>{t('noResultsForType')}</p>
      ) : null}
    </>
  );
}

type T = ReturnType<typeof useTranslations<'search'>>;

function Header({ initial, t }: { initial: string; t: T }) {
  return (
    <div>
      <Heading level={1} id="search-title">
        {t('title')}
      </Heading>
      <Text color="muted">{t('lede')}</Text>
      <div className={resultStyles.searchField}>
        <SearchBar size="lg" initial={initial} autoFocus={initial.length === 0} placeholder={t('searchPlaceholder')} />
      </div>
    </div>
  );
}

function TypeFilters({
  q,
  active,
  counts,
  t,
  locale,
}: {
  q: string;
  active: TypeFilter | undefined;
  counts: Record<TypeFilter, number>;
  t: T;
  locale: AppLocale;
}) {
  const total = counts.sku + counts.category + counts.article;
  return (
    <ul className={resultStyles.filters} aria-label={t('filterAriaLabel')}>
      <li>
        <Link href={routes.search(q)} className={resultStyles.filterChip} data-active={active === undefined ? '' : undefined}>
          {t('filterAll')} <span className="tnum">{localizeDigits(total, locale)}</span>
        </Link>
      </li>
      {TYPE_FILTERS.filter((ty) => counts[ty] > 0).map((ty) => (
        <li key={ty}>
          <Link href={routes.search(q, ty)} className={resultStyles.filterChip} data-active={active === ty ? '' : undefined}>
            {t(`typeLabel.${ty}`)} <span className="tnum">{localizeDigits(counts[ty], locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GroupHead({
  title,
  count,
  truncated,
  moreHref,
  moreLabel,
  extra,
  t,
  locale,
}: {
  title: string;
  count: number;
  truncated: boolean;
  moreHref?: string;
  moreLabel?: string;
  extra?: ReactNode;
  t: T;
  locale: AppLocale;
}) {
  return (
    <div className={resultStyles.groupHead}>
      <h2 className={resultStyles.groupTitle}>{title}</h2>
      <span className={`${resultStyles.groupCount} tnum`}>
        {truncated
          ? t('groupCountTruncated', { count: localizeDigits(count, locale), cap: localizeDigits(GROUP_CAP, locale) })
          : t('groupCount', { count: localizeDigits(count, locale) })}
      </span>
      {extra}
      {moreHref && moreLabel ? (
        <Link href={moreHref} className={resultStyles.more}>
          {moreLabel}
        </Link>
      ) : null}
    </div>
  );
}

function SortControl({
  q,
  activeType,
  sort,
  t,
}: {
  q: string;
  activeType: TypeFilter | undefined;
  sort: SortKey;
  t: T;
}) {
  const base = routes.search(q, activeType);
  return (
    <div className={resultStyles.sort} role="group" aria-label={t('sortAriaLabel')}>
      {SORT_KEYS.map((key) => (
        <Link
          key={key}
          href={key === 'relevance' ? base : `${base}&sort=${key}`}
          className={resultStyles.sortTab}
          data-active={sort === key ? '' : undefined}
          aria-current={sort === key ? 'true' : undefined}
        >
          {t(`sort.${key}`)}
        </Link>
      ))}
    </div>
  );
}

function ProductGroup({
  hits,
  q,
  activeType,
  sort,
  t,
  locale,
}: {
  hits: ProductHit[];
  q: string;
  activeType: TypeFilter | undefined;
  sort: SortKey;
  t: T;
  locale: AppLocale;
}) {
  const tPriceHidden = useTranslations('common.priceHidden');
  const shown = hits.slice(0, GROUP_CAP);
  const truncated = hits.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label={t('groupAriaLabel.products')}>
      <GroupHead
        title={t('productsGroupTitle')}
        count={hits.length}
        truncated={truncated}
        extra={hits.length > 1 ? <SortControl q={q} activeType={activeType} sort={sort} t={t} /> : undefined}
        t={t}
        locale={locale}
      />
      <ul className={`${resultStyles.products} tnum`}>
        {shown.map(({ row, category, subCategory }) => {
          const hiddenLabel = priceHiddenLabelLocalized(row.current, locale, tPriceHidden);
          const displayName = getLocalizedSkuName(row, category, subCategory, locale);
          const categoryName = category ? getLocalizedName(category, locale) : row.categoryId;
          return (
            <li key={row.id}>
              <Link href={routes.sku(row.categoryId, row.subCategoryId, row.slug)} className={resultStyles.productRow}>
                <span className={resultStyles.productMain}>
                  <span className={resultStyles.productName}>{displayName}</span>
                  <span className={resultStyles.productMeta}>
                    <span>{categoryName}</span>
                    {row.factory ? (
                      <>
                        <span className={resultStyles.dot} aria-hidden="true">
                          ·
                        </span>
                        <span>{row.factory}</span>
                      </>
                    ) : null}
                    {row.size ? (
                      <>
                        <span className={resultStyles.dot} aria-hidden="true">
                          ·
                        </span>
                        {/* The word translates; the value itself stays as the
                            catalog's own contextual/free-text size string —
                            same established exclusion as PriceTable's size
                            column (catalogLabels.ts-sourced values). */}
                        <span>
                          {t('sizeLabel')} {localizeDigits(row.size, locale)}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className={resultStyles.productSide}>
                  <span className={resultStyles.priceCol}>
                    {hiddenLabel ? (
                      <Badge tone="neutral">{hiddenLabel}</Badge>
                    ) : (
                      <>
                        <span className={resultStyles.price}>{formatToman(row.current.price, false, locale)}</span>
                        <span className={resultStyles.priceUnit}>{priceUnitCaption(row.priceBasis, row.branchLengthM)}</span>
                      </>
                    )}
                  </span>
                  <MovementBadge dir={row.current.movementDir} pct={row.current.movementPct} />
                  <span className={resultStyles.chevWrap} aria-hidden="true">
                    <ChevronStartIcon size={18} className={`${resultStyles.chev} icon--rtl`} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {truncated ? <p className={resultStyles.truncNote}>{t('truncatedProductsNote')}</p> : null}
    </section>
  );
}

function CategoryGroup({ cats, t, locale }: { cats: CatWithCount[]; t: T; locale: AppLocale }) {
  const shown = cats.slice(0, GROUP_CAP);
  const truncated = cats.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label={t('groupAriaLabel.categories')}>
      <GroupHead
        title={t('categoriesGroupTitle')}
        count={cats.length}
        truncated={truncated}
        moreHref={routes.prices()}
        moreLabel={t('moreCategories')}
        t={t}
        locale={locale}
      />
      <ul className={resultStyles.cats}>
        {shown.map(({ cat, count }) => (
          <li key={cat.id}>
            <Link href={routes.category(cat.slug)} className={resultStyles.catChip}>
              <span className={resultStyles.catIcon} aria-hidden="true">
                <CategoryArt slug={cat.slug} size={28} />
              </span>
              <span>{getLocalizedName(cat, locale)}</span>
              <span className={`${resultStyles.catCount} tnum`}>{localizeDigits(count, locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArticleGroup({ items, t, locale }: { items: Article[]; t: T; locale: AppLocale }) {
  const shown = items.slice(0, GROUP_CAP);
  const truncated = items.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label={t('groupAriaLabel.articles')}>
      <GroupHead
        title={t('articlesGroupTitle')}
        count={items.length}
        truncated={truncated}
        moreHref={routes.blog()}
        moreLabel={t('moreArticles')}
        t={t}
        locale={locale}
      />
      <ul className={resultStyles.articles}>
        {shown.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </ul>
    </section>
  );
}

function PopularCategories({ items, t, locale }: { items: CatWithCount[]; t: T; locale: AppLocale }) {
  return (
    <div className={resultStyles.popular}>
      <p className={resultStyles.popularTitle}>
        <TagIcon size={14} aria-hidden="true" /> {t('popularCategoriesTitle')}
      </p>
      <ul className={resultStyles.cats}>
        {items.map(({ cat, count }) => (
          <li key={cat.id}>
            <Link href={routes.category(cat.slug)} className={resultStyles.catChip}>
              <span className={resultStyles.catIcon} aria-hidden="true">
                <CategoryArt slug={cat.slug} size={28} />
              </span>
              <span>{getLocalizedName(cat, locale)}</span>
              <span className={`${resultStyles.catCount} tnum`}>{localizeDigits(count, locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
