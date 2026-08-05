import type { MetadataRoute } from 'next';

// Required for `output: export` (static-only).
export const dynamic = 'force-static';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Only /api is `Disallow`'d (auth-gated, no snippet value — crawl
      // budget is the only concern).
      //
      // `/admin` used to be listed here and was removed: on the public host
      // every /admin* path is already a hard 404 (middleware rewrite), and a
      // 404 is not indexable, so the entry did no work — while `Disallow`
      // lines are the first thing an automated recon tool reads, which is the
      // opposite of the hide-don't-reveal convention the rest of the codebase
      // follows. The real panel is on panel.ahantime.com and is covered by the
      // `X-Robots-Tag: noindex, nofollow` rule in next.config.mjs.
      //
      // Account/request/cart/search/login
      // deliberately do NOT go here: Google explicitly warns against pairing
      // `Disallow` with page-level `noindex` — a disallowed page's noindex
      // signal is never seen, so an externally-linked URL can still surface
      // in results with no snippet ("no information is available for this
      // page"). Those pages instead rely solely on `noindex` (page metadata +
      // the X-Robots-Tag header in next.config.mjs) — the same pattern
      // already used correctly for /track and /proforma.
      disallow: ['/api'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
    host: SITE_URL,
  };
}
