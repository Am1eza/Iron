import { routes } from '@/lib/routes';
import { ORG_NAME } from '@/lib/seo';
import { getAllPublishedArticles } from '@/lib/server/catalog';
import { buildRssFeed, RSS_HEADERS, RSS_ITEM_LIMIT } from '@/lib/server/rss';

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

export async function GET(): Promise<Response> {
  // Bounded: `getAllPublishedArticles` pages up to 50×200, which is the right
  // answer for a sitemap and very much the wrong one for a feed.
  const articles = (await getAllPublishedArticles('blog')).slice(0, RSS_ITEM_LIMIT);
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
