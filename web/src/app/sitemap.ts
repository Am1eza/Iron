import type { MetadataRoute } from 'next';
import { STATIC_INDEXABLE, routes } from '@/lib/routes';
import { getCategories, getRows, getAllPublishedArticles, isLiveCatalog } from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/server/catalog';
import { TRACK_ORDER } from '@/components/cooperation/tracks';

/**
 * Why this route is dynamic, and why that is not negotiable.
 * ---------------------------------------------------------
 * History: `force-static` was pinned here for `output: export`, then replaced
 * by `revalidate = 3600` so the standalone deploy would refresh hourly. Both
 * were wrong, and the second one was wrong in a way that was invisible.
 *
 * A cached sitemap is *seeded by the build*, and the build runs in CI with no
 * `DATABASE_URL`. `isLiveCatalog()` is therefore false there, every `get*`
 * below answers from `lib/mock`, and the image ships a prerendered
 * `.next/server/app/sitemap.xml.body` full of fixture URLs. Measured on the
 * live image: 7 categories / 45 sub-categories / 243 SKUs, against a database
 * holding 14 / 60 / 135 — 203 URLs Google was told to crawl that 404, and 117
 * live URLs it was never told about. `/prices/sheet` was in there; that
 * category is `is_active = false`.
 *
 * Crucially the deploy recreates the web container from the image, which
 * restores that fixture body and restarts the ISR clock — so "it refreshes
 * hourly" only held if the container outlived the hour, and the first fetch
 * after every deploy served the fabrication under stale-while-revalidate.
 *
 * `force-dynamic` removes the cache entirely: there is no build artifact to
 * ship, nothing for a restart to restore, and the answer is always the
 * database's. The cost is ~18 queries per request, bounded by MEMO_MS below.
 * Requests are a handful a day (crawlers), so this is cheap.
 *
 * The `isLiveCatalog()` guard is the second, independent layer: even if this
 * route is ever prerendered again — a config change, a different deploy
 * target, `output: export` — it can only emit the static routes. A sitemap
 * that omits URLs costs discovery; one that invents them burns crawl budget
 * and teaches Google 404s. Never emit the fixtures.
 */
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

/**
 * Small in-process memo so `force-dynamic` cannot be turned into a database
 * amplifier by anyone willing to request /sitemap.xml in a loop. Same
 * reasoning (and same one-long-lived-Node-process premise) as the redirect
 * cache in `middleware.ts`; on Workers it simply misses, which is correct.
 *
 * A process restart clears it — which is the desired direction here: a restart
 * makes the sitemap *fresher*, never staler, and can never resurrect fixtures.
 */
const MEMO_MS = 60_000;
let memo: { at: number; value: MetadataRoute.Sitemap } | null = null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const value = await buildSitemap();
  memo = { at: Date.now(), value };
  return value;
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_INDEXABLE.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified: now,
    changeFrequency: 'daily',
    priority: path === '/' ? 1 : 0.7,
  }));

  const cooperationEntries: MetadataRoute.Sitemap = TRACK_ORDER.map((track) => ({
    url: new URL(routes.cooperation(track), SITE_URL).toString(),
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // Hard stop: without the database every call below returns fixtures. The
  // static routes are code-defined and true in either mode, so they stay; the
  // catalog and the articles are simply not knowable here and must not be
  // guessed. See the module comment.
  if (!isLiveCatalog()) return [...staticEntries, ...cooperationEntries];

  const categories = (await getCategories()).filter((c) => c.isActive);

  // Sub-category + SKU pages — the bulk of the site's indexable, revenue-relevant
  // content. One getRows() call per category (not per sub-category) — rows are
  // then grouped locally by subCategoryId to avoid N sequential DB round-trips.
  const categoryRows = await Promise.all(categories.map((c) => getRows(c.slug)));
  const subsMap = await getSubsMap();

  // Real freshness for category/sub-category pages: the newest price update
  // among their SKUs, not build time (which misrepresented hourly-changing
  // pages as all edited at deploy).
  const latestUpdate = (rows: Array<{ current: { updatedAt?: string | Date | null } }>): Date => {
    let max = 0;
    for (const r of rows) {
      const t = r.current.updatedAt ? new Date(r.current.updatedAt).getTime() : 0;
      if (t > max) max = t;
    }
    return max > 0 ? new Date(max) : now;
  };

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c, i) => ({
    url: new URL(routes.category(c.slug), SITE_URL).toString(),
    lastModified: latestUpdate(categoryRows[i] ?? []),
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  const subCategoryEntries: MetadataRoute.Sitemap = [];
  const skuEntries: MetadataRoute.Sitemap = [];
  categories.forEach((cat, i) => {
    const rows = categoryRows[i] ?? [];
    const catLatest = latestUpdate(rows);
    for (const sub of subsMap[cat.slug] ?? []) {
      subCategoryEntries.push({
        url: new URL(routes.subCategory(cat.slug, sub.slug), SITE_URL).toString(),
        lastModified: catLatest,
        changeFrequency: 'hourly',
        priority: 0.75,
      });
    }
    for (const row of rows) {
      skuEntries.push({
        url: new URL(routes.sku(row.categoryId, row.subCategoryId, row.slug), SITE_URL).toString(),
        lastModified: row.current.updatedAt ? new Date(row.current.updatedAt) : now,
        changeFrequency: 'hourly',
        priority: 0.65,
      });
    }
  });

  const [blogArticles, newsArticles] = await Promise.all([
    getAllPublishedArticles('blog'),
    getAllPublishedArticles('news'),
  ]);

  const blogEntries: MetadataRoute.Sitemap = blogArticles.map((a) => ({
    url: new URL(routes.blog(a.slug), SITE_URL).toString(),
    lastModified: a.publishAt ? new Date(a.publishAt) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const newsEntries: MetadataRoute.Sitemap = newsArticles.map((a) => ({
    url: new URL(routes.news(a.slug), SITE_URL).toString(),
    lastModified: a.publishAt ? new Date(a.publishAt) : now,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...cooperationEntries,
    ...categoryEntries,
    ...subCategoryEntries,
    ...skuEntries,
    ...blogEntries,
    ...newsEntries,
  ];
}
