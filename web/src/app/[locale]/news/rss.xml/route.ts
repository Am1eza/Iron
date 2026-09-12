import { routes } from '@/lib/routes';
import { ORG_NAME } from '@/lib/seo';
import { getArticlesPage, isLiveCatalog } from '@/lib/server/catalog';
import { buildRssFeed, RSS_HEADERS, RSS_ITEM_LIMIT } from '@/lib/server/rss';

/**
 * /news/rss.xml — the timely market-news feed. See `lib/server/rss.ts` for why
 * this is separate from /blog/rss.xml.
 *
 * Matches the 10-minute window on `/news` and `/news/[slug]`. This is a
 * standalone route handler, not something the root layout can reach, so the
 * ISR warning in `app/layout.tsx` about a dynamic call collapsing the ~250
 * prerendered pages does not apply here.
 */
export const revalidate = 600;

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
    ? await getArticlesPage('news', 1, RSS_ITEM_LIMIT)
    : { articles: [] };
  const xml = buildRssFeed({
    title: `اخبار بازار آهن و فولاد | ${ORG_NAME}`,
    description: 'تازه‌ترین اخبار بازار آهن و فولاد؛ تولید، عرضه و نرخ شمش.',
    pagePath: routes.news(),
    feedPath: '/news/rss.xml',
    articles,
    hrefFor: (slug) => routes.news(slug),
  });
  return new Response(xml, { headers: RSS_HEADERS });
}
