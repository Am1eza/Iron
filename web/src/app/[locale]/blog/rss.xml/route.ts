import { routing } from '@/i18n/routing';
import { routes } from '@/lib/routes';
import { ORG_NAME } from '@/lib/seo';
import { getArticlesPage, isLiveCatalog } from '@/lib/server/catalog';
import { buildRssFeed, RSS_HEADERS, RSS_ITEM_LIMIT } from '@/lib/server/rss';

// Route Handlers under `[locale]` don't inherit the layout's
// `generateStaticParams` — they need their own, or the build can't enumerate
// this dynamic segment at all (`output: export` errors outright; a normal
// build silently falls back to per-request dynamic rendering instead of ISR).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * /blog/rss.xml — the evergreen buying-guide feed. See `lib/server/rss.ts`
 * for why this is separate from /news/rss.xml.
 *
 * Matches the 10-minute window on `/blog` and `/blog/[slug]`, so a freshly
 * published guide reaches a subscriber and a reader at the same time. This is
 * a standalone route handler, not something the root layout can reach, so the
 * ISR warning in `app/layout.tsx` about a dynamic call collapsing the ~250
 * prerendered pages does not apply here.
 */
export const revalidate = 600;
// Route Handlers don't render through the React tree next-intl's plugin
// scopes `setRequestLocale` to, so there's no escape hatch for the global
// per-route locale resolution it still runs here — `force-static` (still
// governed by `revalidate` above) avoids the `headers()` call that would
// otherwise silently downgrade this to a per-request dynamic render.
export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  // Same rule as the sitemap (see `app/sitemap.ts`): this route is prerendered
  // at build time, where there is no DATABASE_URL and the catalog seam answers
  // from `lib/mock`. A feed of fixture articles points subscribers at URLs
  // that 404, so an empty feed is the only honest answer without a database.
  //
  // Bounded AT THE QUERY, not after it: this used to call
  // `getAllPublishedArticles` — up to 50x200 fully-hydrated rows, bodies
  // included — and then `.slice(0, 50)` the result. The feed is
  // `ORDER BY publish_at DESC LIMIT 50`, which is precisely page 1.
  const { articles } = isLiveCatalog()
    ? await getArticlesPage('blog', 1, RSS_ITEM_LIMIT)
    : { articles: [] };
  const xml = buildRssFeed({
    title: `وبلاگ ${ORG_NAME}`,
    description: 'راهنمای خرید، تحلیل بازار و آموزش آهن و فولاد.',
    pagePath: routes.blog(),
    feedPath: '/blog/rss.xml',
    articles,
    hrefFor: (slug) => routes.blog(slug),
  });
  return new Response(xml, { headers: RSS_HEADERS });
}
