import type { MetadataRoute } from 'next';
import { STATIC_INDEXABLE, routes } from '@/lib/routes';
import { getCategories, getRows, getArticlesByType } from '@/lib/server/catalog';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { TRACK_ORDER } from '@/components/cooperation/tracks';

// Required for `output: export` (static-only).
export const dynamic = 'force-static';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const categories = (await getCategories()).filter((c) => c.isActive);

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: new URL(routes.category(c.slug), SITE_URL).toString(),
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  // Sub-category + SKU pages — the bulk of the site's indexable, revenue-relevant
  // content. One getRows() call per category (not per sub-category) — rows are
  // then grouped locally by subCategoryId to avoid N sequential DB round-trips.
  const subCategoryEntries: MetadataRoute.Sitemap = [];
  const skuEntries: MetadataRoute.Sitemap = [];
  const categoryRows = await Promise.all(categories.map((c) => getRows(c.slug)));
  categories.forEach((cat, i) => {
    const rows = categoryRows[i] ?? [];
    for (const sub of CATEGORY_SUBS[cat.slug] ?? []) {
      subCategoryEntries.push({
        url: new URL(routes.subCategory(cat.slug, sub.slug), SITE_URL).toString(),
        lastModified: now,
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
    getArticlesByType('blog'),
    getArticlesByType('news'),
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
