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

export async function getCategories(): Promise<Category[]> {
  if (!live()) return mockCategories.filter((c) => c.isActive);
  return repo.listCategories();
}

export async function getRows(categorySlug: string): Promise<PriceRow[]> {
  if (!live()) return mock.getRows(categorySlug);
  return repo.tableRows(categorySlug);
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

export async function getArticle(slug: string): Promise<ArticleFull | Article | undefined> {
  if (!live()) return mock.findArticle(slug);
  return (await findPublishedBySlug(slug)) ?? undefined;
}
