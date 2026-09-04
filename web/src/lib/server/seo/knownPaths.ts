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
import { TOOL_SLUGS, COOPERATION_TRACKS } from '@/lib/routes';
import { NEWS_TOPICS } from '@/lib/data/newsTopics';
import { publicCatalogPaths } from '@/lib/server/repos/catalogRepo';
import { publishedGuardPaths } from '@/lib/server/repos/articlesRepo';
import { hasDb } from '@/lib/server/db/client';

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
  // /blog/category/[slug] (US-14.5) — a literal segment Next's router
  // matches before /blog/[slug], so a slug of literally "category" can never
  // collide with it; still its own pattern since it is a second depth level.
  /^\/blog\/category\/[^/]+$/,
  // /news/topic/[slug] — fixed, code-defined topics (see below), the
  // same STATIC_DYNAMIC_PATHS family as /tools and /cooperation, not the
  // DB-backed one — no `known` dependency, so it can never fail-open-404
  // even before the catalog has loaded.
  /^\/news\/topic\/[^/]+$/,
  // The paginated archive. `/blog/page/999` renders and is then ISR-cached
  // under its own key, and neither `notFound()` nor `redirect()` produces a
  // real status code from inside an already-matched route in this Next version
  // (both reply 200 — measured), so the ONLY way to answer honestly is the
  // same middleware rewrite every other unknown slug uses. `known` therefore
  // carries `/blog/page/2 ... /blog/page/<last>`; see `publishedGuardPaths`.
  /^\/blog\/page\/[^/]+$/,
  /^\/news\/page\/[^/]+$/,
  /^\/tools\/[^/]+$/,
  /^\/cooperation\/[^/]+$/,
];

/**
 * `/tools/[tool]` and `/cooperation/[track]` are dynamic segments over a set
 * that is fixed in code — no data source can add one at runtime — so their
 * valid URLs are known without a query and are ALWAYS part of the guard, even
 * when the database-backed half has not loaded.
 *
 * `dynamicParams = false` would also produce a genuine 404 for these, and was
 * tried first, but Next raises an internal `NoFallbackError` for every miss and
 * `instrumentation.ts`'s `onRequestError` forwards it to GlitchTip — turning
 * any bot walking `/tools/<junk>` into an error-report flood. Same 404, no
 * fabricated errors, and 404 handling stays in one place.
 */
export const STATIC_DYNAMIC_PATHS: readonly string[] = [
  ...TOOL_SLUGS.map((t) => `/tools/${t}`),
  ...COOPERATION_TRACKS.map((t) => `/cooperation/${t}`),
  ...NEWS_TOPICS.map((t) => `/news/topic/${t.slug}`),
];

/**
 * Static routes that *live inside* a guarded prefix and are therefore matched
 * by the patterns above even though no dynamic segment ever serves them.
 *
 * `/blog/rss.xml` matches `/^\/blog\/[^/]+$/`, is obviously not a published
 * article slug, and was consequently hard-404'd on the live site — taking both
 * feeds down while `/blog` and `/news` kept advertising them via
 * `<link rel="alternate" type="application/rss+xml">`. Next's own router
 * prefers the literal segment over `[slug]`, so these must be excluded here to
 * match. Anything added under a guarded prefix as a real file route belongs in
 * this list.
 */
const STATIC_UNDER_GUARDED_PREFIX: readonly string[] = ['/blog/rss.xml', '/news/rss.xml'];

/** Is this pathname served by a DB-backed dynamic route we can validate? */
export function isGuardedPath(pathname: string): boolean {
  // Exact spelling only, deliberately. Because `shouldNotFound` also judges
  // the RAW pathname (see there), an encoded spelling of one of these —
  // `/blog/rss%2Exml` — is guarded and 404s. That is the better outcome, not a
  // gap: measured against production, that URL currently returns **500**
  // ("Invariant app-page handler received invalid cache entry APP_ROUTE" from
  // Next's own router, reported to GlitchTip), so guarding it converts an
  // unauthenticated 500-on-demand into a clean 404. The canonical spelling,
  // which is the only one anything links, is untouched.
  if (STATIC_UNDER_GUARDED_PREFIX.includes(pathname)) return false;
  return GUARDED_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Cheap first gate for middleware: could this pathname possibly be guarded?
 *
 * Kept separate from `isGuardedPath` so the hot path can skip loading the
 * catalog entirely for the ~everything else — a homepage or an API request
 * must never wait on a catalog query just to be told it isn't a SKU.
 */
export const GUARDED_PREFIXES = [
  '/prices/',
  '/blog/',
  '/news/',
  '/tools/',
  '/cooperation/',
] as const;

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
function trimTrailingSlashes(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

export function normalizeKnownPath(pathname: string): string {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    /* malformed escape sequence — judge the raw form */
  }
  return trimTrailingSlashes(p);
}

/** Which family a guarded path belongs to — code-defined or database-backed. */
function isStaticFamily(pathname: string): boolean {
  return (
    pathname.startsWith('/tools/') ||
    pathname.startsWith('/cooperation/') ||
    pathname.startsWith('/news/topic/')
  );
}

/**
 * Should this request be turned into a real 404?
 *
 * @param known    Valid paths from the database (catalog + articles).
 *                 **Empty means "not loaded"** and is always treated as
 *                 "don't touch this request" — see the fail-open note above.
 *                 The code-defined families are judged without it.
 * @param opts.redirectsLoaded Whether the redirect table has been read
 *                 successfully at least once this process. When it has not,
 *                 DB-backed paths are left alone: middleware checks redirects
 *                 first, so 404ing here while that lookup is cold would turn a
 *                 renamed URL's 308 into a 404 for the length of the cache
 *                 window — losing exactly the ranking the redirect exists to
 *                 preserve. Observed for real on a cold process, hence the
 *                 flag. Code-defined families never had that dependency.
 */
export function shouldNotFound(
  pathname: string,
  known: ReadonlySet<string>,
  opts: { redirectsLoaded?: boolean } = {},
): boolean {
  // Judge BOTH forms. Decoding first was a bypass: `%2F` decodes to `/`, so
  // `/blog/aaa%2Fbbb` became the two-segment `/blog/aaa/bbb`, which matches no
  // guarded pattern — `isGuardedPath` returned false, the guard declined, and
  // the request fell through to `/blog/[slug]` where `notFound()` replies 200
  // and is then ISR-cached behind a ~365-day stale-while-revalidate window.
  // That is unlimited attacker-minted cacheable ghost pages, each costing two
  // Postgres reads and a full render — exactly what this module exists to
  // prevent. Splitting one slug into two segments must not argue a request out
  // of the guard: Next's router would have 404'd a genuine `/blog/a/b` itself.
  const raw = trimTrailingSlashes(pathname);
  const p = normalizeKnownPath(pathname);
  if (!isGuardedPath(p) && !isGuardedPath(raw)) return false;

  if (isStaticFamily(p) || isStaticFamily(raw)) {
    return !STATIC_DYNAMIC_PATHS.includes(p) && !STATIC_DYNAMIC_PATHS.includes(raw);
  }

  if (known.size === 0) return false;
  if (opts.redirectsLoaded === false) return false;
  // `known` holds decoded paths, so the raw form can only match when it
  // carried no escapes at all — checking it costs nothing and cannot 404 a
  // path that is genuinely known.
  return !known.has(p) && !known.has(raw);
}

/**
 * The `known` set's cache — moved here (out of proxy.ts, which merely
 * consumed it) so an admin write can invalidate it too. Same in-process,
 * TTL'd shape proxy.ts's `redirectCache` still keeps locally (one
 * long-lived Node process — see proxy.ts's runtime comment).
 *
 * Confirmed live (2026-09-01, e2e/admin-pricing-catalog.spec.ts's delete
 * test, CI run 33518928535): a SKU created via the admin API and read back
 * immediately hard-404'd through THIS guard — `revalidateCatalog` cleared
 * Next's ISR page cache and the AI advisor's `domainFacts`, but never told
 * this middleware-level guard its `known` set was now stale, so it kept
 * routing the brand-new URL through `notFound()` for up to
 * `KNOWN_PATHS_TTL_MS` regardless. `invalidateKnownPaths` closes that gap the
 * same way `invalidateDomainFacts` already does for the advisor's cache.
 */
let knownPathCache: Set<string> = new Set();
let knownPathsLoadedAt = 0;
const KNOWN_PATHS_TTL_MS = 60_000;

/** Force the next `getKnownPaths()` call to hit the DB, regardless of TTL. */
export function invalidateKnownPaths(): void {
  knownPathsLoadedAt = 0;
}

/**
 * The current `known` set, refreshing it first if stale. Empty = "not
 * loaded"/"DB hiccup" and is fail-open by `shouldNotFound`'s own contract —
 * never replaced with an empty set on a failed refresh, only left as
 * whatever last loaded successfully.
 */
export async function getKnownPaths(): Promise<ReadonlySet<string>> {
  if (Date.now() - knownPathsLoadedAt < KNOWN_PATHS_TTL_MS) return knownPathCache;
  // Set BEFORE the await (synchronously, no yield point in between) so two
  // requests landing in the same tick don't both kick off a refresh.
  knownPathsLoadedAt = Date.now();
  if (!hasDb()) return knownPathCache;
  try {
    const [catalog, articles] = await Promise.all([publicCatalogPaths(), publishedGuardPaths()]);
    knownPathCache = new Set([...catalog, ...articles]);
  } catch {
    // Keep whatever was already loaded — see the class doc comment above.
  }
  return knownPathCache;
}
