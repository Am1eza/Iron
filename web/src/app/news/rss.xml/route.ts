import { routes } from '@/lib/routes';
import { ORG_NAME } from '@/lib/seo';
import { getAllPublishedArticles } from '@/lib/server/catalog';
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
  // Bounded: `getAllPublishedArticles` pages up to 50×200, which is the right
  // answer for a sitemap and very much the wrong one for a feed.
  const articles = (await getAllPublishedArticles('news')).slice(0, RSS_ITEM_LIMIT);
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
