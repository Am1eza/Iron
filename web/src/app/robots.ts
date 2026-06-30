import type { MetadataRoute } from 'next';

// Required for `output: export` (static-only).
export const dynamic = 'force-static';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Personal/admin/transient areas (IA): keep out of indexes.
      disallow: ['/admin', '/account', '/request', '/cart', '/search', '/login', '/api'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
    host: SITE_URL,
  };
}
