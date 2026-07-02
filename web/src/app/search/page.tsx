import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';
import { getRows } from '@/lib/mock/catalogData';
import { searchAll } from '@/lib/server/catalog';
import type { PriceRow, Article, Category } from '@/lib/types/domain';
import { formatToman, toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Breadcrumbs,
  EmptyState,
  emptyPresets,
  MovementBadge,
} from '@/components/ui';
import { ArticleCard } from '@/components/content/ArticleCard';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { SearchIcon, TagIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { SearchBox } from '@/components/search/SearchBox';
import resultStyles from '@/components/search/SearchResults.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'جستجو',
  description: 'جستجوی محصولات، دسته‌بندی‌ها و مقالات آهن‌تایم.',
  path: '/search',
  noindex: true,
});

type Props = { searchParams: Promise<{ q?: string }> };

/** Max items shown per group before we add a «more results» note. */
const GROUP_CAP = 24;

/** Normalize text for substring matching: lowercase + Persian/Arabic digits → Latin. */
function norm(input: string): string {
  return normalizeDigits(input).toLowerCase();
}

type ProductHit = { row: PriceRow; categoryName: string };

export default async function SearchPage({ searchParams }: Props) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? '').trim();
  const needle = norm(q);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'جستجو' },
  ];

  // ----- Empty query: prompt + popular categories -----
  if (needle.length === 0) {
    return (
      <Container>
        <Section space={10}>
          <Stack gap={6}>
            <Header crumbs={crumbs} initial="" />
            <EmptyState
              size="section"
              glyph={<SearchIcon size={44} />}
              headline="چه چیزی را جستجو می‌کنید؟"
              body="نام محصول، سایز، کارخانه یا عنوان مقاله را بنویسید. مثلاً «میلگرد ۱۴» یا «فولاد مبارکه»."
            />
            <PopularCategories />
          </Stack>
        </Section>
      </Container>
    );
  }

  // ----- Run the search (mock: substring scan; live: DB search) -----
  const { skus: skuHits, articles: articleHits } = await searchAll(q);
  const catName = new Map(categories.map((c) => [c.slug, c.name] as const));
  const productHits: ProductHit[] = skuHits.map((row) => ({
    row,
    categoryName: catName.get(row.categoryId) ?? row.categoryId,
  }));

  const categoryHits: Category[] = categories.filter(
    (c) => c.isActive && norm(c.name).includes(needle),
  );

  const totalHits = productHits.length + categoryHits.length + articleHits.length;

  return (
    <Container>
      <Section space={10}>
        <Stack gap={8}>
          <Header crumbs={crumbs} initial={q} />

          {totalHits === 0 ? (
            <>
              <EmptyState size="section" {...emptyPresets.searchNoResults(q)} showAi />
              <PopularCategories />
            </>
          ) : (
            <p className={resultStyles.summary}>
              <span className="tnum">{toPersianDigits(totalHits)}</span> نتیجه برای{' '}
              <span className={resultStyles.term}>«{q}»</span>
            </p>
          )}

          {productHits.length > 0 ? (
            <ProductGroup hits={productHits} />
          ) : null}

          {categoryHits.length > 0 ? <CategoryGroup cats={categoryHits} /> : null}

          {articleHits.length > 0 ? <ArticleGroup items={articleHits} /> : null}
        </Stack>
      </Section>
    </Container>
  );
}

/* ----------------------------- sections ----------------------------- */

function Header({ crumbs, initial }: { crumbs: { label: string; href?: string }[]; initial: string }) {
  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <Heading level={1} id="search-title">
        جستجو
      </Heading>
      <Text color="muted">
        در میان محصولات، دسته‌بندی‌ها و مقالات آهن‌تایم بگردید. اول مشورت، بعد خرید.
      </Text>
      <div className={resultStyles.searchField}>
        <SearchBox initial={initial} autoFocus={initial.length === 0} />
      </div>
    </div>
  );
}

function GroupHead({
  title,
  count,
  truncated,
  moreHref,
  moreLabel,
}: {
  title: string;
  count: number;
  truncated: boolean;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className={resultStyles.groupHead}>
      <h2 className={resultStyles.groupTitle}>{title}</h2>
      <span className={`${resultStyles.groupCount} tnum`}>
        {toPersianDigits(count)} مورد{truncated ? ` (${toPersianDigits(GROUP_CAP)} مورد اول)` : ''}
      </span>
      {moreHref && moreLabel ? (
        <Link href={moreHref} className={resultStyles.more}>
          {moreLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ProductGroup({ hits }: { hits: ProductHit[] }) {
  const shown = hits.slice(0, GROUP_CAP);
  const truncated = hits.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label="نتایج محصولات">
      <GroupHead title="محصولات" count={hits.length} truncated={truncated} />
      <ul className={`${resultStyles.products} tnum`}>
        {shown.map(({ row, categoryName }) => (
          <li key={row.id}>
            <Link
              href={routes.sku(row.categoryId, row.subCategoryId, row.slug)}
              className={resultStyles.productRow}
            >
              <span className={resultStyles.productMain}>
                <span className={resultStyles.productName}>{row.name}</span>
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
                      <span>سایز {toPersianDigits(row.size)}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className={resultStyles.productSide}>
                <span className={resultStyles.priceCol}>
                  <span className={resultStyles.price}>{formatToman(row.current.price, false)}</span>
                  <span className={resultStyles.priceUnit}>تومان / کیلوگرم</span>
                </span>
                <MovementBadge dir={row.current.movementDir} pct={row.current.movementPct} />
                <ChevronStartIcon size={18} className={`${resultStyles.chev} icon--rtl`} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {truncated ? (
        <p className={resultStyles.truncNote}>
          برای دیدن همهٔ محصولات این جستجو، از فیلترهای صفحهٔ قیمت‌ها استفاده کنید.
        </p>
      ) : null}
    </section>
  );
}

function CategoryGroup({ cats }: { cats: Category[] }) {
  const shown = cats.slice(0, GROUP_CAP);
  const truncated = cats.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label="نتایج دسته‌بندی‌ها">
      <GroupHead
        title="دسته‌بندی‌ها"
        count={cats.length}
        truncated={truncated}
        moreHref={routes.prices()}
        moreLabel="همهٔ دسته‌ها"
      />
      <ul className={resultStyles.cats}>
        {shown.map((cat) => {
          const count = getRows(cat.slug).length;
          return (
            <li key={cat.id}>
              <Link href={routes.category(cat.slug)} className={resultStyles.catChip}>
                <span className={resultStyles.catIcon} aria-hidden="true">
                  <CategoryArt slug={cat.slug} size={28} />
                </span>
                <span>{cat.name}</span>
                <span className={`${resultStyles.catCount} tnum`}>{toPersianDigits(count)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ArticleGroup({ items }: { items: Article[] }) {
  const shown = items.slice(0, GROUP_CAP);
  const truncated = items.length > GROUP_CAP;
  return (
    <section className={resultStyles.group} aria-label="نتایج مقالات">
      <GroupHead
        title="مقالات و اخبار"
        count={items.length}
        truncated={truncated}
        moreHref={routes.blog()}
        moreLabel="مشاهدهٔ وبلاگ"
      />
      <ul className={resultStyles.articles}>
        {shown.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </ul>
    </section>
  );
}

function PopularCategories() {
  return (
    <div className={resultStyles.popular}>
      <p className={resultStyles.popularTitle}>
        <TagIcon size={14} aria-hidden="true" /> دسته‌بندی‌های پرجستجو
      </p>
      <ul className={resultStyles.cats}>
        {categories
          .filter((c) => c.isActive)
          .map((cat) => {
            const count = getRows(cat.slug).length;
            return (
              <li key={cat.id}>
                <Link href={routes.category(cat.slug)} className={resultStyles.catChip}>
                  <span className={resultStyles.catIcon} aria-hidden="true">
                    <CategoryArt slug={cat.slug} size={28} />
                  </span>
                  <span>{cat.name}</span>
                  <span className={`${resultStyles.catCount} tnum`}>{toPersianDigits(count)}</span>
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
