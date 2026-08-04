/**
 * Server-component data seam for the catalog — same call surface the pages
 * used from the mock module, switching mock⇄live invisibly. Live mode calls
 * the repos directly (no HTTP round-trip inside the same app).
 */
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import type { Category, PriceRow, Article } from '@/lib/types/domain';
import * as mock from '@/lib/mock/catalogData';
import { categories as mockCategories, marketValues as mockMarketValues } from '@/lib/mock/fixtures';
import * as repo from '@/lib/server/repos/catalogRepo';
import { getMarketValue } from '@/lib/server/repos/marketRepo';
import { normalizeDigits } from '@/lib/utils/format';
import { searchArticles, listPublished, findPublishedBySlug, type ArticleFull } from '@/lib/server/repos/articlesRepo';

const live = () => API_MODE === 'live' && hasDb();

/**
 * Is this seam answering from the real database, or from the mock fixtures?
 *
 * Every `get*` below silently substitutes fixture data when the answer is
 * `false`. That is the right behaviour for a page (a preview build should
 * still render something) and a *catastrophic* one for anything published to a
 * search engine: a sitemap or a feed built from fixtures advertises URLs that
 * do not exist and omits every URL that does.
 *
 * Machine-readable, crawler-facing routes MUST therefore check this and emit
 * nothing catalog-shaped rather than emit fabrications. Exported so those
 * routes state the dependency explicitly instead of trusting the seam.
 */
export function isLiveCatalog(): boolean {
  return live();
}

export async function getCategories(): Promise<Category[]> {
  if (!live()) return mockCategories.filter((c) => c.isActive);
  return repo.listCategories();
}

/** Active sub-categories grouped by category slug — the live source for
 *  every public taxonomy surface (mega-menu, drawer, home cascade, category
 *  chips, breadcrumbs, sitemap). Admin-created sub-categories used to be
 *  invisible site-wide because these surfaces read the static MOCK_CATEGORY_SUBS
 *  fixture; that fixture is now only the mock/dev fallback. */
export async function getSubsMap(): Promise<Record<string, Array<{ slug: string; name: string }>>> {
  if (!live()) {
    const { MOCK_CATEGORY_SUBS } = await import('@/lib/data/nav');
    return MOCK_CATEGORY_SUBS;
  }
  return repo.listAllSubCategories();
}

export async function getRows(categorySlug: string): Promise<PriceRow[]> {
  if (!live()) return mock.getRows(categorySlug);
  return repo.tableRows(categorySlug);
}

/** Active SKU count per category slug, in one query in live mode. Callers
 *  that only need counts must use this rather than measuring getRows(). */
export async function getSkuCounts(categorySlugs: readonly string[]): Promise<Map<string, number>> {
  if (!live()) {
    const entries = await Promise.all(
      categorySlugs.map(async (slug) => [slug, (await mock.getRows(slug)).length] as const),
    );
    return new Map(entries);
  }
  return repo.skuCountsByCategory();
}

export async function getSubRows(categorySlug: string, subSlug: string): Promise<PriceRow[]> {
  if (!live()) return mock.getSubRows(categorySlug, subSlug);
  return repo.tableRows(categorySlug, subSlug);
}

export async function findSku(slug: string): Promise<PriceRow | undefined> {
  if (!live()) return mock.findSku(slug);
  return (await repo.findSkuRow(slug)) ?? undefined;
}

export async function relatedRows(row: PriceRow, n = 4): Promise<PriceRow[]> {
  if (!live()) return mock.relatedRows(row, n);
  return repo.relatedSkuRows(row.slug, n);
}

/** The بورس billet reference value (US-03.3) — same per-kg Toman convention
 *  every SKU price already uses site-wide (see PriceTable's "قیمت‌ها ... برای
 *  هر کیلوگرم" note), so a SKU's price vs this is a direct ratio, not a
 *  formula that needs a conversion factor. Null when unset/never entered
 *  (OP hasn't filled the ticker's billet field yet) — callers must treat
 *  that as "no comparison available", not zero. */
export async function getBilletReference(): Promise<{ value: number; updatedAt: string } | null> {
  if (!live()) {
    const m = mockMarketValues.find((v) => v.key === 'billet');
    return m ? { value: m.value, updatedAt: m.updatedAt } : null;
  }
  const row = await getMarketValue('billet');
  return row ? { value: row.value, updatedAt: row.updatedAt.toISOString() } : null;
}

/** Chart series (number[]) — history values ending at the current price. */
export async function priceSeries(skuSlug: string, currentPrice: number, days = 365): Promise<number[]> {
  if (!live()) return mock.priceSeries(skuSlug, currentPrice, days);
  const range = days <= 7 ? '7d' : days <= 30 ? '30d' : days <= 90 ? '90d' : '1y';
  const points = await repo.skuHistory(skuSlug, range);
  if (points.length === 0) return mock.priceSeries(skuSlug, currentPrice, days);
  return points.map((p) => p.price);
}

export async function searchAll(q: string): Promise<{ skus: PriceRow[]; articles: Article[] }> {
  if (!live()) {
    const needle = normalizeDigits(q.trim()).toLowerCase();
    const hay = (s: string) => normalizeDigits(s).toLowerCase();
    const skus = mockCategories
      .flatMap((c) => mock.getRows(c.slug))
      .filter((r) => hay(`${r.name} ${r.factory ?? ''} ${r.size ?? ''} ${r.grade ?? ''}`).includes(needle))
      .slice(0, 20);
    const articles = mock.articles
      .filter((a) => a.status === 'published' && hay(a.title).includes(needle))
      .slice(0, 10);
    return { skus, articles };
  }
  const [skus, articles] = await Promise.all([repo.searchSkus(q), searchArticles(q)]);
  return { skus, articles };
}

/* ------------------------------ articles ------------------------------ */

export async function getArticlesByType(type: 'blog' | 'news'): Promise<Article[]> {
  if (!live()) return mock.articlesByType(type);
  const { articles } = await listPublished(type);
  return articles;
}

/**
 * Paged variant for the public index and the sitemap.
 *
 * `getArticlesByType` silently returns only `listPublished`'s first page of 20
 * and throws away the `total` it is handed — so from the 21st published
 * article onward the oldest ones vanished from /blog AND from the sitemap,
 * with no pager, no 404 and no hint that anything had been cut. Latent at
 * seven articles, certain to bite.
 */
export async function getArticlesPage(
  type: 'blog' | 'news',
  page = 1,
  perPage = 12,
): Promise<{ articles: Article[]; total: number }> {
  if (!live()) {
    const all = mock.articlesByType(type);
    return { articles: all.slice((page - 1) * perPage, page * perPage), total: all.length };
  }
  return listPublished(type, page, perPage);
}

/** Every published slug of a type, for the sitemap — which must never be a
 *  single page of results. */
export async function getAllPublishedArticles(type: 'blog' | 'news'): Promise<Article[]> {
  if (!live()) return mock.articlesByType(type);
  const perPage = 200;
  const out: Article[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { articles } = await listPublished(type, page, perPage);
    out.push(...articles);
    if (articles.length < perPage) break;
  }
  return out;
}

export async function getArticle(slug: string): Promise<ArticleFull | Article | undefined> {
  if (!live()) return mock.findArticle(slug);
  return (await findPublishedBySlug(slug)) ?? undefined;
}
