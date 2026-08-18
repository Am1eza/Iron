/**
 * Server-component data seam for the catalog — same call surface the pages
 * used from the mock module, switching mock⇄live invisibly. Live mode calls
 * the repos directly (no HTTP round-trip inside the same app).
 */
import { cache } from 'react';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import type { Category, PriceRow, Article } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import * as mock from '@/lib/mock/catalogData';
import { categories as mockCategories, marketValues as mockMarketValues } from '@/lib/mock/fixtures';
import * as repo from '@/lib/server/repos/catalogRepo';
import { getMarketValue } from '@/lib/server/repos/marketRepo';
import { normalizeDigits } from '@/lib/utils/format';
import {
  searchArticles,
  listPublished,
  listPublishedByCategory,
  categoryArticleCounts,
  listPublishedByNewsTopic,
  newsTopicArticleCounts,
  relatedArticles,
  findPublishedBySlug,
  type ArticleFull,
} from '@/lib/server/repos/articlesRepo';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';
import { listApprovedComments, type PublicComment } from '@/lib/server/repos/commentsRepo';

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
export async function getSubsMap(): Promise<Record<string, SubCat[]>> {
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

/** One headline PriceRow per active category, in category (taxonomy) order —
 *  the /prices hub's multi-category live summary. See
 *  catalogRepo.headlineRowPerCategory for what "headline" means. */
export async function getHeadlineRows(): Promise<PriceRow[]> {
  if (!live()) {
    const rows = await Promise.all(
      mockCategories.filter((c) => c.isActive).map(async (c) => (await mock.getRows(c.slug))[0]),
    );
    return rows.filter((r): r is PriceRow => Boolean(r));
  }
  return repo.headlineRowPerCategory();
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

/**
 * The admin's chosen «بر اساس کارخانه» order for a category (US-18.2), or an
 * empty list when they have never arranged it.
 *
 * No mock fallback on purpose: the fixtures carry no such ordering, and an
 * invented one would make a preview build disagree with production about
 * which mill leads the page. Empty means "keep the previous, price-derived
 * order" everywhere it is consumed, so mock mode simply behaves as it did
 * before this existed.
 */
export async function getFactoryOrder(categorySlug: string): Promise<string[]> {
  if (!live()) return [];
  return repo.factoryOrderForCategory(categorySlug);
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

/**
 * The public index and the sitemap.
 *
 * There used to be a `getArticlesByType` beside this that silently returned
 * only `listPublished`'s first page of 20 and threw away the `total` it was
 * handed — so from the 21st published article onward the oldest ones vanished
 * from /blog AND from the sitemap, with no pager, no 404 and no hint that
 * anything had been cut. Its last two callers moved to `getRelatedArticles`.
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

/** Articles filed under a catalog category — /blog/category/[slug]. Mock mode
 *  has no category associations on its fixtures, so it answers empty rather
 *  than guessing; the page's own empty-state already covers "no articles". */
export async function getArticlesPageByCategory(
  categoryId: string,
  page = 1,
  perPage = 20,
): Promise<{ articles: Article[]; total: number }> {
  if (!live()) return { articles: [], total: 0 };
  return listPublishedByCategory(categoryId, page, perPage);
}

/** Published-article count per category id — the rail widget's source for
 *  which category tiles to show and what count to print on each. */
export async function getCategoryArticleCounts(): Promise<Record<string, number>> {
  if (!live()) return {};
  return categoryArticleCounts();
}

export type CategoryRailItem = {
  slug: string;
  name: string;
  /** `null` when the category has articles but no photo set yet in the admin
   *  catalog form — `CategoryRail` renders a brand-tinted fallback tile
   *  rather than skipping it. */
  imageUrl: string | null;
  count: number;
};

/**
 * The category rail's actual data — every active category that has at least
 * one published article, ordered the same way the rest of the site orders
 * categories (`categories.order`, the admin-editable taxonomy order), never
 * by count: a rail that reshuffles itself every time an article gets
 * published would be disorienting to a reader browsing it repeatedly.
 */
export async function getBlogCategoryRailItems(): Promise<CategoryRailItem[]> {
  const [cats, counts] = await Promise.all([getCategories(), getCategoryArticleCounts()]);
  return cats
    .map((c) => ({ slug: c.slug, name: c.name, imageUrl: c.imageUrl ?? null, count: counts[c.id] ?? 0 }))
    .filter((c) => c.count > 0);
}

export async function getArticlesPageByNewsTopic(
  topicSlug: string,
  page = 1,
  perPage = 20,
): Promise<{ articles: Article[]; total: number }> {
  if (!live()) return { articles: [], total: 0 };
  return listPublishedByNewsTopic(topicSlug, page, perPage);
}

/** Published-news count per topic slug — the news-topic rail's source for
 *  which topic chips to show and what count to print on each. */
export async function getNewsTopicArticleCounts(): Promise<Record<string, number>> {
  if (!live()) return {};
  return newsTopicArticleCounts();
}

export type NewsTopicRailItem = { slug: string; name: string; count: number };

/** Approved comments for an article — mock mode has no comment store at
 *  all, so it answers empty rather than a fabricated thread. `viewerId`
 *  is the CURRENT visitor (from `getSessionVerified()` in the page),
 *  omitted for an anonymous one — see `listApprovedComments`'s own
 *  comment for what that changes. */
export async function getApprovedComments(articleId: string, viewerId?: string): Promise<PublicComment[]> {
  if (!live()) return [];
  return listApprovedComments(articleId, viewerId);
}

/**
 * The news-topic rail's actual data — every topic (from the fixed
 * `NEWS_TOPICS` list, not a DB query) that has at least one published news
 * article, in the taxonomy's own declared order. Same shape and same
 * `count > 0` filter as `getBlogCategoryRailItems`, for the same reason: a
 * rail entry a reader could click into and find nothing is worse than not
 * showing it.
 */
export async function getNewsTopicRailItems(): Promise<NewsTopicRailItem[]> {
  const counts = await getNewsTopicArticleCounts();
  return NEWS_TOPICS.map((t) => ({ slug: t.slug, name: t.name, count: counts[t.slug] ?? 0 })).filter(
    (t) => t.count > 0,
  );
}

/** The 3 cards under an article. One projected query — see `relatedArticles`. */
export async function getRelatedArticles(
  type: 'blog' | 'news',
  excludeSlug: string,
  limit = 3,
): Promise<Article[]> {
  if (!live()) {
    return mock
      .articlesByType(type)
      .filter((a) => a.slug !== excludeSlug)
      .slice(0, limit);
  }
  return relatedArticles(type, excludeSlug, limit);
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

/**
 * Request-deduped: `/blog/[slug]` and `/news/[slug]` each call this from BOTH
 * `generateMetadata` and the page body, which was two identical
 * `findPublishedBySlug` queries per render (measured: 3 scans on `articles`
 * per cold article render, of which one was pure duplication). `cache()` is
 * per-request, so it changes nothing about ISR or about two different readers.
 */
export const getArticle = cache(
  async (slug: string): Promise<ArticleFull | Article | undefined> => {
    if (!live()) return mock.findArticle(slug);
    return (await findPublishedBySlug(slug)) ?? undefined;
  },
);
