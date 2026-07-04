import type { MetadataRoute } from 'next';

// Required for `output: export` (static-only).
export const dynamic = 'force-static';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Only /admin and /api are `Disallow`'d (auth-gated, no snippet value —
      // crawl budget is the only concern). Account/request/cart/search/login
      // deliberately do NOT go here: Google explicitly warns against pairing
      // `Disallow` with page-level `noindex` — a disallowed page's noindex
      // signal is never seen, so an externally-linked URL can still surface
      // in results with no snippet ("no information is available for this
      // page"). Those pages instead rely solely on `noindex` (page metadata +
      // the X-Robots-Tag header in next.config.mjs) — the same pattern
      // already used correctly for /track and /proforma.
      disallow: ['/admin', '/api'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
    host: SITE_URL,
  };
}
