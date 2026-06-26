import type { MetadataRoute } from 'next';
import { STATIC_INDEXABLE, routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fooladno.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_INDEXABLE.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified: now,
    changeFrequency: 'daily',
    priority: path === '/' ? 1 : 0.7,
  }));

  // Category pages (sub-category/SKU entries are added from the DB in the live build).
  const categoryEntries: MetadataRoute.Sitemap = categories
    .filter((c) => c.isActive)
    .map((c) => ({
      url: new URL(routes.category(c.slug), SITE_URL).toString(),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    }));

  return [...staticEntries, ...categoryEntries];
}
