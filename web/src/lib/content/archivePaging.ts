/**
 * Archive pagination URLs for /blog and /news.
 *
 * Pure and dependency-free on purpose: `middleware.ts` (Node runtime, no React)
 * and the archive route components both need exactly one answer to "what is
 * page N's URL, and is this `[n]` segment real?". Two copies is how the
 * middleware redirect and the route's own bounds check drift apart, and a
 * disagreement there is a redirect loop.
 */

import { routes } from '@/lib/routes';

/** Cards per archive page. */
export const PER_PAGE = 12;

/**
 * Upper bound on the `[n]` segment.
 *
 * `/blog/page/<anything>` is a route that renders and is then ISR-cached under
 * its own key, so an unbounded parameter space here would re-create the
 * attacker-minted ghost-page problem the 404 guard exists to stop. 5,000 pages
 * is ~60,000 articles — far past any plausible archive, and small enough that
 * the cache-key space is not a resource.
 */
export const MAX_PAGE = 5_000;

/** `/blog` for page 1, `/blog/page/N` after that — page 1 has exactly one URL. */
export function archiveHref(type: 'blog' | 'news', page: number): string {
  return type === 'news' ? routes.newsPage(page) : routes.blogPage(page);
}

/**
 * The `[n]` segment, or null when the caller should redirect to page 1
 * instead. `1` is deliberately null: page 1 is `/blog`, and `/blog/page/1`
 * must not become a second URL for it.
 */
export function parsePageParam(raw: string): number | null {
  if (!/^[1-9][0-9]{0,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 2 && n <= MAX_PAGE ? n : null;
}

/**
 * The archive URLs middleware must rewrite before anything else looks at them.
 *
 *  - `/blog?page=2` → `/blog/page/2`: the page number moved into the path so
 *    the route could be genuinely ISR'd. Anything already linked or indexed
 *    with the query form keeps working.
 *  - `?page=1` and any junk value → the bare index, which is where they used
 *    to land anyway (`Number('abc') || 1`).
 *  - `/blog/page/1` → `/blog`: page 1 has exactly one URL. Without this the
 *    404 guard would (correctly, since it is not in the known set) hard-404 a
 *    URL a human might reasonably type.
 *
 * Everything else under `/blog/page/*` is deliberately NOT handled here: an
 * out-of-range or malformed page is judged against the real page count by the
 * middleware 404 guard, because neither `notFound()` nor `redirect()` inside
 * the matched route produces a real status code in this Next version — both
 * reply 200, and are then ISR-cached.
 */
export function archiveRedirect(pathname: string, pageParam: string | null): string | null {
  if (pathname === '/blog/page/1') return '/blog';
  if (pathname === '/news/page/1') return '/news';
  if (pathname !== '/blog' && pathname !== '/news') return null;
  if (pageParam === null) return null;
  const type = pathname === '/news' ? 'news' : 'blog';
  return archiveHref(type, parsePageParam(pageParam) ?? 1);
}
