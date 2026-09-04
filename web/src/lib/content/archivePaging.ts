/**
 * Archive pagination URLs for /blog and /news.
 *
 * Pure and dependency-free on purpose: `proxy.ts` (Node runtime, no React)
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
 *  - `?page=1` → the bare index, which is page 1's only URL.
 *  - `/blog/page/1` → `/blog`, same reason. Without this the 404 guard would
 *    (correctly, since it is not in the known set) hard-404 a URL a human
 *    might reasonably type.
 *  - A junk `?page=` value lands on the bare index too — where
 *    `Number('abc') || 1` used to put it — but as a TEMPORARY redirect. 308 is
 *    cached by the browser for that exact URL forever, and minting permanent
 *    redirects keyed on unbounded attacker-supplied input is cache pollution
 *    for no benefit. Only the real moves are permanent.
 *
 * Everything else under `/blog/page/*` is deliberately NOT handled here: an
 * out-of-range or malformed page is judged against the real page count by the
 * middleware 404 guard, because neither `notFound()` nor `redirect()` inside
 * the matched route produces a real status code in this Next version — both
 * reply 200, and are then ISR-cached.
 *
 * Only the `page` parameter is consumed. The caller must keep the rest of the
 * query string: `?page=1&utm_source=newsletter` dropping its campaign tag on
 * the way through — permanently, since the browser caches the 308 — would
 * silently break Matomo attribution for every newsletter link.
 */
export type ArchiveRedirect = { pathname: string; permanent: boolean };

export function archiveRedirect(pathname: string, pageParam: string | null): ArchiveRedirect | null {
  if (pathname === '/blog/page/1') return { pathname: '/blog', permanent: true };
  if (pathname === '/news/page/1') return { pathname: '/news', permanent: true };
  if (pathname !== '/blog' && pathname !== '/news') return null;
  if (pageParam === null) return null;
  const type = pathname === '/news' ? 'news' : 'blog';
  const page = parsePageParam(pageParam);
  return {
    pathname: archiveHref(type, page ?? 1),
    permanent: page !== null || pageParam === '1',
  };
}

/**
 * The section index an unknown `/blog/page/*` URL should fall back to.
 *
 * The 404 guard's normal answer for an unknown slug is a hard 404, and that is
 * right for `/blog/some-invented-article`. It is the wrong answer for
 * `/blog/page/7`: the page is not a fabricated thing, it is a real archive
 * position that no longer exists (or does not exist yet — the guard's `known`
 * set is on a 60s cache, so a newly-crossed page boundary is briefly unknown).
 * A reader who followed an old `?page=7` link, and a crawler holding an
 * indexed one, should both land on content rather than a tombstone.
 *
 * TEMPORARY, not permanent: page 7 may well exist again next week.
 */
export function archiveIndexFallback(pathname: string): string | null {
  if (pathname.startsWith('/blog/page/')) return '/blog';
  if (pathname.startsWith('/news/page/')) return '/news';
  return null;
}
