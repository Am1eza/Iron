/**
 * The set of public URLs that a *dynamic* route may legitimately answer 200 for.
 *
 * Why this exists
 * ---------------
 * Every dynamic route on this site (`/prices/[category]`, `.../[sub]`,
 * `.../[sku]`, `/blog/[slug]`, `/news/[slug]`) calls `notFound()` for an
 * unknown slug — and every one of them still replied **HTTP 200**. Measured on
 * the live deploy (Next 15.5.19):
 *
 *     GET /prices/zz-fresh-1234 → 200, x-nextjs-cache: MISS, x-nextjs-prerender: 1
 *                                 Cache-Control: s-maxage=300, stale-while-revalidate=31535700
 *
 * `notFound()` thrown inside an already-matched route does not set the status
 * in this Next version (the same limitation CLAUDE.md §3 records for the admin
 * pages) — and because these segments carry `revalidate = 300`, the resulting
 * ghost page is then ISR-cached and re-served for up to ~365 days by the
 * stale-while-revalidate window. They carry `noindex`, so they never get
 * indexed, but Search Console reports them as Soft 404s and every one of them
 * costs crawl budget that should be spent on real SKUs.
 *
 * The fix uses the mechanism this codebase already trusts for exactly this
 * problem: middleware rewrites to a path that matches nothing, so Next's own
 * routing layer produces a genuine 404 (see `/__admin_denied__`). Middleware
 * cannot know the catalog, so it needs this list.
 *
 * Fail-open by construction
 * -------------------------
 * The stated risk of this change is that a bug here hard-404s live SKUs. Two
 * things bound that:
 *
 *  1. An empty set means "unknown", never "nothing is valid" —
 *     `shouldNotFound` returns false and traffic is untouched. So a DB outage,
 *     a cold process, or a failed refresh degrades to today's behaviour
 *     (200 ghosts), not to a dead catalog.
 *  2. Only the guarded families are checked at all. Anything else — every
 *     static page, every API route, the admin tree — is never consulted here.
 */

/**
 * URL families served by a dynamic segment whose slug set lives in the
 * database. Each pattern matches ONLY the depth that route actually serves:
 * `/prices` and `/blog` (the index pages) are static routes and are not
 * matched; a deeper path than the route provides is already a real 404 from
 * Next's router.
 */
const GUARDED_PATTERNS: readonly RegExp[] = [
  /^\/prices\/[^/]+$/, //                    /prices/[category]
  /^\/prices\/[^/]+\/[^/]+$/, //             /prices/[category]/[sub]
  /^\/prices\/[^/]+\/[^/]+\/[^/]+$/, //      /prices/[category]/[sub]/[sku]
  /^\/blog\/[^/]+$/,
  /^\/news\/[^/]+$/,
];

/** Is this pathname served by a DB-backed dynamic route we can validate? */
export function isGuardedPath(pathname: string): boolean {
  return GUARDED_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Cheap first gate for middleware: could this pathname possibly be guarded?
 *
 * Kept separate from `isGuardedPath` so the hot path can skip loading the
 * catalog entirely for the ~everything else — a homepage or an API request
 * must never wait on a catalog query just to be told it isn't a SKU.
 */
export const GUARDED_PREFIXES = ['/prices/', '/blog/', '/news/'] as const;

export function hasGuardedPrefix(pathname: string): boolean {
  return GUARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Normalise a request pathname to the form `knownPaths` stores.
 *
 * Slugs are ASCII by decision (CLAUDE.md §3), but a request can still arrive
 * percent-encoded, and `routes.ts` itself builds URLs with
 * `encodeURIComponent`. Decoding here means `/prices/rebar%2Fdeformed` and
 * `/prices/rebar/deformed` are judged as what they resolve to rather than as
 * two different strings. A malformed escape (`%zz`) cannot be decoded and is
 * left as-is — it will simply not be found, which is the right answer.
 */
export function normalizeKnownPath(pathname: string): string {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    /* malformed escape sequence — judge the raw form */
  }
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/**
 * Should this request be turned into a real 404?
 *
 * @param known Every valid dynamic path. **Empty means "not loaded"** and is
 *              always treated as "don't touch this request" — see the fail-open
 *              note above.
 */
export function shouldNotFound(pathname: string, known: ReadonlySet<string>): boolean {
  if (known.size === 0) return false;
  const p = normalizeKnownPath(pathname);
  if (!isGuardedPath(p)) return false;
  return !known.has(p);
}
