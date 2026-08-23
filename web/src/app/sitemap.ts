import type { MetadataRoute } from 'next';
import { STATIC_INDEXABLE, routes } from '@/lib/routes';
import {
  getCategories,
  getRows,
  getAllPublishedArticles,
  getCategoryArticleCounts,
  getNewsTopicArticleCounts,
  isLiveCatalog,
} from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/server/catalog';
import { listRedirectFromPaths, normalizePath } from '@/lib/server/repos/redirectsRepo';
import { factoryFacets, sizeFacets } from '@/lib/utils/catalogFacets';
import { TRACK_ORDER } from '@/components/cooperation/tracks';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';

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

/**
 * The newest edit among a set of articles, or `undefined` when there is none.
 *
 * `undefined` rather than "now": an omitted `<lastmod>` says nothing, which is
 * honest, whereas the request time says "edited this second", which is a claim
 * and a false one. Same rule the static entries follow.
 */
function latestArticleEdit(
  articles: readonly { updatedAt?: string; publishAt?: string }[],
): Date | undefined {
  let max = 0;
  for (const a of articles) {
    const raw = a.updatedAt ?? a.publishAt;
    const t = raw ? new Date(raw).getTime() : 0;
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max > 0 ? new Date(max) : undefined;
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /**
   * No `lastModified` on the hand-written pages, deliberately.
   *
   * These entries used to stamp themselves with the request time, which under
   * `force-dynamic` means *every* crawl saw «modified just now» for /about,
   * /contact, /faq and the cooperation tracks — pages whose copy changes a
   * couple of times a year. A date that is always today is not a freshness
   * signal, it is noise that costs the signal its meaning on the pages where
   * it IS real (the catalog entries below, which carry a genuine
   * `current.updatedAt`). Nothing in the app tracks when a hard-coded page's
   * copy last changed, so there is no honest value to put here, and the field
   * is optional: an omitted `<lastmod>` tells a crawler nothing, which is
   * exactly the truth. Do not "fix" this by reintroducing `now`.
   */
  const staticEntries: MetadataRoute.Sitemap = STATIC_INDEXABLE.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: 'daily',
    priority: path === '/' ? 1 : 0.7,
  }));

  const cooperationEntries: MetadataRoute.Sitemap = TRACK_ORDER.map((track) => ({
    url: new URL(routes.cooperation(track), SITE_URL).toString(),
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
  // Per-factory and per-size landing pages. Derived from the SAME `rows` the
  // pages themselves filter, so this can never advertise a URL that 404s —
  // a facet exists here if and only if at least one active SKU carries it,
  // which is exactly the condition those pages `notFound()` on. Categories
  // with no SKUs contribute nothing, so the empty ones never appear.
  const facetEntries: MetadataRoute.Sitemap = [];
  categories.forEach((cat, i) => {
    const rows = categoryRows[i] ?? [];
    const catLatest = latestUpdate(rows);
    for (const f of factoryFacets(rows)) {
      facetEntries.push({
        url: new URL(routes.categoryByFactory(cat.slug, f.slug), SITE_URL).toString(),
        lastModified: catLatest,
        changeFrequency: 'hourly',
        // Between the sub-category (0.75) and the SKU (0.65): a facet page
        // aggregates many SKUs, but it is a filtered view of a sub-category
        // tree rather than a taxonomy node of its own.
        priority: 0.7,
      });
    }
    for (const s of sizeFacets(rows)) {
      facetEntries.push({
        url: new URL(routes.categoryBySize(cat.slug, s.slug), SITE_URL).toString(),
        lastModified: catLatest,
        changeFrequency: 'hourly',
        priority: 0.7,
      });
    }
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

  const [blogArticles, newsArticles, categoryArticleCounts, newsTopicArticleCounts] = await Promise.all([
    getAllPublishedArticles('blog'),
    getAllPublishedArticles('news'),
    getCategoryArticleCounts(),
    getNewsTopicArticleCounts(),
  ]);

  // Only categories that currently have at least one article (US-14.5) — an
  // empty /blog/category/[slug] is a real, non-404 page (see knownPaths.ts),
  // but publishing it to Google is a thin/duplicate-content page with
  // nothing of its own to rank on, exactly what this file's own history
  // (the comment above, on the fixture-vs-live incident) says to avoid.
  const blogCategoryEntries: MetadataRoute.Sitemap = categories
    .filter((c) => (categoryArticleCounts[c.id] ?? 0) > 0)
    .map((c) => ({
      url: new URL(routes.blogCategory(c.slug), SITE_URL).toString(),
      // A listing page changes when one of the things it lists changes, and
      // that date is already in hand — `blogArticles` is the full set, fetched
      // above. No extra query, and a real answer instead of the request time.
      lastModified: latestArticleEdit(
        blogArticles.filter((a) => (a.relatedCategoryIds ?? []).includes(c.id)),
      ),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  const blogEntries: MetadataRoute.Sitemap = blogArticles.map((a) => ({
    url: new URL(routes.blog(a.slug), SITE_URL).toString(),
    // `updatedAt` first: with `publishAt` alone, editing a published article
    // produced NO recrawl signal at all — the sitemap entry simply did not
    // move. Every PATCH stamps `updatedAt`, including SEO-only edits, which
    // is what the column means; the SKU entries above already use it.
    // `updatedAt` first — `publishAt` alone meant editing a published article
    // produced no recrawl signal at all. The fallbacks are for the type, not
    // for live data: `toArticleDto` always sets it (notNull column).
    lastModified: new Date(a.updatedAt ?? a.publishAt ?? now),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // Same "no thin content" reasoning as blogCategoryEntries above, for the
  // news-topic rail's own pages — a topic with zero articles today
  // (e.g. سیاست‌گذاری و مقررات before the first policy story) is a real,
  // non-404 page (see knownPaths.ts) but not one worth telling Google
  // about yet.
  const newsTopicEntries: MetadataRoute.Sitemap = NEWS_TOPICS.filter(
    (t) => (newsTopicArticleCounts[t.slug] ?? 0) > 0,
  ).map((t) => ({
    url: new URL(routes.newsTopic(t.slug), SITE_URL).toString(),
    // Same as blogCategoryEntries: the newest story filed under the topic.
    lastModified: latestArticleEdit(
      newsArticles.filter((a) => (a.relatedNewsTopicIds ?? []).includes(t.slug)),
    ),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const newsEntries: MetadataRoute.Sitemap = newsArticles.map((a) => ({
    url: new URL(routes.news(a.slug), SITE_URL).toString(),
    // `updatedAt` first: with `publishAt` alone, editing a published article
    // produced NO recrawl signal at all — the sitemap entry simply did not
    // move. Every PATCH stamps `updatedAt`, including SEO-only edits, which
    // is what the column means; the SKU entries above already use it.
    // `updatedAt` first — `publishAt` alone meant editing a published article
    // produced no recrawl signal at all. The fallbacks are for the type, not
    // for live data: `toArticleDto` always sets it (notNull column).
    lastModified: new Date(a.updatedAt ?? a.publishAt ?? now),
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const entries = [
    ...staticEntries,
    ...cooperationEntries,
    ...categoryEntries,
    ...subCategoryEntries,
    ...facetEntries,
    ...skuEntries,
    ...blogEntries,
    ...newsEntries,
    ...blogCategoryEntries,
    ...newsTopicEntries,
  ];

  // Last gate: never advertise a URL this site then refuses to serve.
  //
  // An admin redirect row beats a real route match in `middleware.ts`, so a
  // sub-category can be `is_active = true`, carry SKUs, be rendered into the
  // list above by the catalog queries — and still answer 308 to the crawler
  // that follows it. Verified against production 1405/05/31 by fetching all
  // 1,235 published URLs: zero 404s, and exactly three redirects, all of
  // them this shape (`/prices/profile/prvfyl-*`).
  //
  // Those three are gone — `scripts/unshadowProfileSubCategories.ts` removed
  // the rows on 1405/05/31, and the crawl is clean. Their cause is worth
  // keeping in view, because it is not the one it looks like: the پروفیل
  // sub-categories were retired while empty, then RE-CREATED by the owner ten
  // days later, and `slugify()` handed the new rows the same slugs the
  // retirement had already redirected away. Any sub-category an admin
  // recreates can land in a retired URL the same way, and nothing in the
  // create path checks for it.
  //
  // So this gate stays. It suppresses the symptom, not the cause: a live page
  // that a stale row hides is still hidden from visitors, and the row is
  // still the thing to remove — this only stops us pointing Google at it in
  // the meantime. Every other filter here works from the catalog's own state,
  // which cannot see the redirect table at all.
  return dropRedirectedEntries(entries, await listRedirectFromPaths());
}

/** Exported for the test — pure, so it needs no database. */
export function dropRedirectedEntries(
  entries: MetadataRoute.Sitemap,
  redirected: ReadonlySet<string>,
): MetadataRoute.Sitemap {
  if (redirected.size === 0) return entries;
  return entries.filter((e) => !redirected.has(normalizePath(new URL(e.url).pathname)));
}
