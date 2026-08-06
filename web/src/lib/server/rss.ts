/**
 * RSS 2.0 feed generation (W7).
 *
 * Hand-rolled rather than the `feed` package: the whole output is the ~40
 * lines below, and `feed` costs ~30KB plus an `xml-js` transitive for it.
 *
 * `/blog` and `/news` get SEPARATE feeds on purpose. They already differ
 * everywhere else that matters — `changeFrequency` in the sitemap
 * ('monthly' vs 'daily') and the JSON-LD type `articleJsonLd` emits
 * (`Article` vs `NewsArticle`) — because one is evergreen buying guides and
 * the other is timely market news. Pushing daily rebar-price items at someone
 * who subscribed for buying guides is how a feed gets unsubscribed.
 */
import type { Article } from '@/lib/types/domain';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';

/**
 * XML text/attribute escaping. THE load-bearing function in this file.
 *
 * A single raw `&` or `<` in an editorial title — «میلگرد ۱۴ & ۱۶», an HTML
 * fragment pasted into an excerpt — makes the document not well-formed, and
 * the XML spec requires a reader to reject a malformed document outright
 * rather than recover. So the failure is total and completely silent: the feed
 * returns 200, the logs are clean, and every subscriber simply sees nothing,
 * forever. Every single interpolation into the feed goes through here.
 *
 * The control-character strip comes first: XML 1.0 has no way to represent
 * C0 controls at all, not even as a numeric reference, so escaping them is
 * not an option — they must be removed.
 */
export function esc(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RFC-822, which is what RSS dates must be. `toUTCString()` emits exactly
 *  that ("Mon, 12 Jan 2026 08:00:00 GMT") and is locale-independent — a
 *  Persian-locale date formatter here would emit unparseable garbage. */
function rfc822(date: Date): string {
  return date.toUTCString();
}

function absolute(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function buildRssFeed(opts: {
  /** Channel title, description and the page the feed describes. */
  title: string;
  description: string;
  /** Site-relative path of the HTML page (`/blog`), for `<link>`. */
  pagePath: string;
  /** Site-relative path of the feed itself (`/blog/rss.xml`), for atom:self. */
  feedPath: string;
  /** Already sliced to a bounded count and newest-first. */
  articles: Article[];
  /** Site-relative permalink builder for one article. */
  hrefFor: (slug: string) => string;
}): string {
  const { title, description, pagePath, feedPath, articles, hrefFor } = opts;

  // Newest edit across the feed. Falls back to "now" for an empty feed rather
  // than emitting no element — a missing lastBuildDate makes some readers
  // re-fetch every item every poll.
  const stamps = articles
    .map((a) => (a.updatedAt ? Date.parse(a.updatedAt) : NaN))
    .filter((n) => Number.isFinite(n));
  const lastBuild = stamps.length ? new Date(Math.max(...stamps)) : new Date();

  const items = articles
    .map((a) => {
      const url = absolute(hrefFor(a.slug));
      const pubDate = a.publishAt ? `\n      <pubDate>${esc(rfc822(new Date(a.publishAt)))}</pubDate>` : '';
      // `excerpt`, never `bodyMd`: the body is Markdown (not HTML), runs to
      // 100,000 characters, and `toArticleDto` does not even fetch it.
      const desc = a.excerpt ? `\n      <description>${esc(a.excerpt)}</description>` : '';
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>${pubDate}${desc}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(absolute(pagePath))}</link>
    <description>${esc(description)}</description>
    <language>fa-IR</language>
    <lastBuildDate>${esc(rfc822(lastBuild))}</lastBuildDate>
    <atom:link href="${esc(absolute(feedPath))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

/** Shared response headers. `s-maxage` matches the `revalidate = 600` on the
 *  feed routes and on `blog/[slug]/page.tsx`, so a subscriber and a reader
 *  never see the site at two different ages. */
export const RSS_HEADERS = {
  'Content-Type': 'application/rss+xml; charset=utf-8',
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
} as const;

/** A feed is a fixed-size window, never an archive: serving the whole archive
 *  as one XML document on every cache miss is a self-inflicted outage, and
 *  readers only ever show the newest handful anyway. Both feed routes pass
 *  this as the page size, so it now bounds the QUERY — they used to page the
 *  whole archive out of Postgres and slice afterwards. */
export const RSS_ITEM_LIMIT = 50;
