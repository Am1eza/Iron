import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getSkuCounts, searchAll } from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import {
  SearchPageContent,
  type ProductHit,
  type CatWithCount,
  type TypeFilter,
  type SortKey,
} from './SearchPageContent';

// noindex'd (thin/duplicate search-results content) — no canonical `path` is
// set since canonical is meaningless on a page that's never indexed.
export const metadata: Metadata = buildMetadata({
  title: 'جستجو',
  description: 'جستجوی محصولات، دسته‌بندی‌ها و مقالات آهن‌تایم.',
  noindex: true,
});

type Props = { searchParams: Promise<{ q?: string; type?: string; sort?: string }> };

const TYPE_FILTERS = ['sku', 'category', 'article'] as const;
function parseTypeFilter(raw: string | undefined): TypeFilter | undefined {
  return TYPE_FILTERS.includes(raw as TypeFilter) ? (raw as TypeFilter) : undefined;
}

/** Product-group sort — a query param, not client state: `searchAll` already
 *  fetches every hit (there's no pagination to push this into a DB query
 *  for), so re-ordering the array server-side needs no backend change and
 *  keeps this a plain Server Component (no client JS for what three links
 *  can do). `relevance` is the default — whatever order `searchAll` already
 *  returns, unchanged. Labels themselves are translated client-side in
 *  `SearchPageContent`; this is order + validity only. */
const SORT_KEYS: SortKey[] = ['relevance', 'price', 'factory'];

function sortProductHits(hits: ProductHit[], sort: SortKey): ProductHit[] {
  if (sort === 'price') {
    // Hidden («تماس بگیرید») rows have no comparable price — sink them to
    // the end rather than let their `0` sentinel (catalogRepo.toPriceRow)
    // sort as the cheapest result on the page.
    return [...hits].sort((a, b) => {
      const av = a.row.current.priceHidden || a.row.current.priceIsEstimated ? Infinity : a.row.current.price;
      const bv = b.row.current.priceHidden || b.row.current.priceIsEstimated ? Infinity : b.row.current.price;
      return av - bv;
    });
  }
  if (sort === 'factory') {
    // Same reasoning as the price sink above — a factory-less row sorts
    // AFTER every real factory name, not before, via a sentinel that
    // collates last rather than the empty string's default (first).
    return [...hits].sort((a, b) => (a.row.factory || '￿').localeCompare(b.row.factory || '￿', 'fa'));
  }
  return hits;
}

/** Normalize text for substring matching: lowercase + Persian/Arabic digits → Latin. */
function norm(input: string): string {
  return normalizeDigits(input).toLowerCase();
}

/** Per-category SKU counts, computed server-side (DB in live mode) — never
 *  from the mock catalog, so counts shown here match what /prices lists.
 *  One grouped COUNT, not one full price-table read per category: this used
 *  to fetch every SKU and its joined price for all 14 categories purely to
 *  measure `.length`, and the page does it on two different branches. */
async function withCounts(cats: Category[]): Promise<CatWithCount[]> {
  const counts = await getSkuCounts(cats.map((c) => c.slug));
  return cats.map((cat) => ({ cat, count: counts.get(cat.slug) ?? 0 }));
}

/**
 * Breadcrumbs and metadata stay fa — the established SSR-shell exception
 * (see `prices/[category]/page.tsx` etc.): locale resolves client-side
 * only, so this Server Component's own text can't localize. The page's
 * actual content is `SearchPageContent`, a Client Component that does.
 */
const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'جستجو' },
];

export default async function SearchPage({ searchParams }: Props) {
  const { q: rawQ, type: rawType, sort: rawSort } = await searchParams;
  const q = (rawQ ?? '').trim();
  const needle = norm(q);
  const activeType = parseTypeFilter(rawType);
  const sort: SortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : 'relevance';

  // Category list & counts are always live (DB in live mode), never the mock
  // catalog — a search page previously sourced these from `@/lib/mock/*`
  // even in production, so it could show categories/counts an admin had
  // since renamed, removed, or added.
  const [categories, subsMap] = await Promise.all([getCategories(), getSubsMap()]);
  const catBySlug = new Map(categories.map((c) => [c.slug, c] as const));

  // ----- Empty query: prompt + popular categories -----
  if (needle.length === 0) {
    const popular = await withCounts(categories);
    return (
      <Container>
        <Section space={10}>
          <Stack gap={6}>
            <Breadcrumbs items={crumbs} />
            <SearchPageContent
              emptyQuery
              q=""
              activeType={undefined}
              sort="relevance"
              totalHits={0}
              productHits={[]}
              categoryHits={[]}
              articleHits={[]}
              popularCategories={popular}
            />
          </Stack>
        </Section>
      </Container>
    );
  }

  // ----- Run the search (mock: substring scan; live: DB search) -----
  const { skus: skuHits, articles: articleHits } = await searchAll(q);
  const productHits: ProductHit[] = sortProductHits(
    skuHits.map((row) => {
      const category = catBySlug.get(row.categoryId);
      const subCategory = subsMap[row.categoryId]?.find((s) => s.slug === row.subCategoryId);
      return { row, category, subCategory };
    }),
    sort,
  );

  const categoryHits: Category[] = categories.filter((c) => norm(c.name).includes(needle));

  const totalHits = productHits.length + categoryHits.length + articleHits.length;
  const categoryHitsWithCounts = await withCounts(categoryHits);
  const popular = totalHits === 0 ? await withCounts(categories) : [];

  return (
    <Container>
      <Section space={10}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />
          <SearchPageContent
            emptyQuery={false}
            q={q}
            activeType={activeType}
            sort={sort}
            totalHits={totalHits}
            productHits={productHits}
            categoryHits={categoryHitsWithCounts}
            articleHits={articleHits}
            popularCategories={popular}
          />
        </Stack>
      </Section>
    </Container>
  );
}
