import { NextResponse, type NextRequest } from 'next/server';
import { resolveAuthEnforced } from '@/lib/auth/authEnforced';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { can, permissionForAdminPath } from '@/lib/auth/roles';
import { hasDb } from '@/lib/server/db/client';
import { adminListRedirects, normalizePath } from '@/lib/server/repos/redirectsRepo';
import { publicCatalogPaths } from '@/lib/server/repos/catalogRepo';
import { publishedArticlePaths } from '@/lib/server/repos/articlesRepo';
import { hasGuardedPrefix, shouldNotFound } from '@/lib/server/seo/knownPaths';
import { resolvePanelRouting, PANEL_HOSTNAME } from '@/lib/server/utils/panelHost';

/**
 * Middleware — admin auth gating, admin-configured URL redirects (US-14.3),
 * and the panel.ahantime.com subdomain rewrite.
 * Security response headers (CSP, X-Frame-Options, HSTS, ...) live in
 * `next.config.mjs`'s `headers()` — the single source of truth. They used
 * to be duplicated here too, which is exactly how X-Frame-Options ended up
 * set to two different values (DENY vs SAMEORIGIN) from two layers.
 * Note: `noindex` for admin/personal areas is set in next.config.mjs headers + robots.ts.
 * Persian-path auth gating is also enforced at the route/layout level (server components)
 * to avoid encoded-path matcher pitfalls.
 *
 * Runs on the Node.js middleware runtime (stable since Next 15.2) so it can
 * query Postgres directly for redirects — the default Edge runtime can't
 * (`pg` needs Node sockets, see next.config.mjs's `serverExternalPackages`).
 * Redirects were originally attempted from `src/app/not-found.tsx` instead;
 * that page turned out to be statically pre-rendered at build time in this
 * Next.js version regardless of dynamic API use, so per-request logic there
 * silently never ran — see that file's comment. Middleware genuinely runs
 * per request, which is why the redirect list is cached in-process (a DB
 * round trip on every single page view would be its own cost) rather than
 * queried fresh each time: this Docker/self-hosted deployment runs
 * middleware inside the same long-lived Node process (not per-request
 * isolates), so a module-level cache persists correctly across requests.
 * NOTE: this assumption does NOT hold for the separate Cloudflare Workers
 * deployment target (see GEO-ROUTING.md) — that target would need a
 * different caching strategy (e.g. KV) if it ever serves redirects too.
 */
export const runtime = 'nodejs';

const SESSION_COOKIE = 'ahantime_at'; // access-token cookie (lib/auth/session)

// Fails CLOSED — see resolveAuthEnforced for why. Local dev must set
// AUTH_ENFORCED=false explicitly to reach /admin without the panel subdomain.
const AUTH_ENFORCED = resolveAuthEnforced(process.env);

// panel.ahantime.com is the SAME app/container as ahantime.com — Caddy just
// proxies both hostnames to it (see Caddyfile). Every path on this host maps
// to its /admin/* counterpart (panel.ahantime.com/leads → /admin/leads
// internally, see lib/server/utils/panelHost.ts), so staff never type
// "/admin" — except a short passthrough list (API routes, /login, ...).
// Because the session cookie is never given an explicit `domain:` (see
// lib/auth/session.ts), a login on panel.ahantime.com only ever produces a
// cookie scoped to that host — a login there never leaks a working admin
// cookie to the public site.

let redirectCache = new Map<string, { toPath: string; permanent: boolean }>();
let cacheLoadedAt = 0;
const REDIRECT_CACHE_TTL_MS = 60_000;

async function refreshRedirectCacheIfStale(): Promise<void> {
  if (Date.now() - cacheLoadedAt < REDIRECT_CACHE_TTL_MS) return;
  // Set BEFORE the await (synchronously, no yield point in between) so two
  // requests landing in the same tick don't both kick off a refresh.
  cacheLoadedAt = Date.now();
  if (!hasDb()) return;
  try {
    const rows = await adminListRedirects();
    redirectCache = new Map(rows.map((r) => [r.fromPath, { toPath: r.toPath, permanent: r.permanent }]));
  } catch {
    // A DB hiccup must never break normal traffic — keep serving whatever
    // (possibly stale, possibly still-empty) cache was already loaded.
  }
}

/**
 * Live catalog/article URLs, for turning an unknown slug into a REAL 404
 * (see lib/server/seo/knownPaths.ts for the full why). Same in-process,
 * TTL'd cache shape as `redirectCache` above and valid for the same reason
 * (one long-lived Node process). Empty = "not loaded" and never blocks a
 * request, so a DB hiccup or a cold start degrades to the previous
 * soft-404-200 behaviour rather than to a dead catalog.
 */
let knownPathCache: Set<string> = new Set();
let knownPathsLoadedAt = 0;
const KNOWN_PATHS_TTL_MS = 60_000;

async function refreshKnownPathsIfStale(): Promise<void> {
  if (Date.now() - knownPathsLoadedAt < KNOWN_PATHS_TTL_MS) return;
  knownPathsLoadedAt = Date.now(); // before the await — see refreshRedirectCacheIfStale
  if (!hasDb()) return;
  try {
    const [catalog, articles] = await Promise.all([publicCatalogPaths(), publishedArticlePaths()]);
    knownPathCache = new Set([...catalog, ...articles]);
  } catch {
    // Keep whatever was already loaded. Never empty the set on failure: an
    // empty set means "unknown" and is fail-open, but replacing a good set
    // with an empty one would also throw away a working guard for no reason.
  }
}

export async function middleware(req: NextRequest) {
  const onPanelHost = req.headers.get('host') === PANEL_HOSTNAME;
  const { shouldPrefix, effectivePathname } = resolvePanelRouting(req.headers.get('host'), req.nextUrl.pathname);

  // Redirects (US-14.3) are a public-site SEO concern — never checked on the
  // panel host, where every path is already spoken for by the admin rewrite.
  if (!onPanelHost) {
    await refreshRedirectCacheIfStale();
    const redirectMatch = redirectCache.get(normalizePath(req.nextUrl.pathname));
    if (redirectMatch) {
      const url = req.nextUrl.clone();
      url.pathname = redirectMatch.toPath;
      url.search = ''; // the configured target is a complete destination, not a query passthrough
      return NextResponse.redirect(url, redirectMatch.permanent ? 308 : 307);
    }

    // A slug that exists in no table must answer a REAL 404, not a cached
    // ghost 200. Deliberately AFTER the redirect lookup: a retired slug that
    // an admin has mapped to its replacement must still redirect, not 404 —
    // that is the whole point of the redirect table, and checking 404 first
    // would silently disable it for every renamed URL.
    //
    // `notFound()` in these routes replies 200 in this Next version (see
    // knownPaths.ts for the measurement), and `revalidate = 300` then caches
    // the ghost behind a ~365-day stale-while-revalidate window. Rewriting to
    // a path that matches no route makes Next's own router produce the 404 —
    // the same technique `/__admin_denied__` below already relies on.
    if (hasGuardedPrefix(req.nextUrl.pathname)) {
      await refreshKnownPathsIfStale();
      if (shouldNotFound(req.nextUrl.pathname, knownPathCache)) {
        const url = req.nextUrl.clone();
        url.pathname = '/__not_found__';
        url.search = '';
        return NextResponse.rewrite(url);
      }
    }
  }

  // The admin panel lives ONLY on panel.ahantime.com. On the public host the
  // /admin/* pages and /api/admin/* endpoints are a hard 404 — hidden, not
  // redirected, so the main domain reveals nothing about the panel's
  // existence and a staff member browsing ahantime.com is just a normal
  // user. Gated on AUTH_ENFORCED so local dev (localhost, mock mode) keeps
  // /admin reachable without the subdomain.
  if (AUTH_ENFORCED && !onPanelHost) {
    const p = req.nextUrl.pathname;
    // /panel-login is the panel host's own entrance — on the public host it
    // is hidden along with everything else panel-shaped.
    if (
      p === '/admin' ||
      p.startsWith('/admin/') ||
      p === '/api/admin' ||
      p.startsWith('/api/admin/') ||
      p === '/panel-login' ||
      p.startsWith('/panel-login/')
    ) {
      const url = req.nextUrl.clone();
      url.pathname = '/__admin_denied__';
      return NextResponse.rewrite(url);
    }
  }

  // Admin gating (ASCII path → safe to match here).
  if (AUTH_ENFORCED && effectivePathname.startsWith('/admin')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      const url = req.nextUrl.clone();
      // An expired access cookie is NOT a lost session: the refresh cookie is
      // good for 30 days, but it's path-scoped to /api/auth so it never
      // arrives with a page request — middleware can't see it. Bounce through
      // the silent-refresh route (which does receive it) before ever asking
      // for a new OTP; that hop is what stopped staff being logged out —
      // and charged for an SMS — after every short break. `_r=1` marks a
      // hop already spent, so a genuinely dead session goes to /login instead
      // of ping-ponging.
      const spent = req.nextUrl.searchParams.get('_r') === '1';
      url.pathname = spent ? '/login' : '/api/auth/silent';
      url.search = '';
      // The ORIGINAL path (not effectivePathname) — on the panel host this
      // must stay unprefixed so the post-login redirect lands back on
      // panel.ahantime.com/leads, not .../admin/leads (which would then get
      // ANOTHER /admin prepended on re-entry and 404).
      url.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    // An authenticated-but-unauthorized visitor must get a real 404, not
    // just the *look* of one. Each admin page/layout already calls the
    // Server Component `notFound()` for this (hide, don't reveal), but a
    // `notFound()` thrown deep in an already-matched route's render tree
    // reliably replies HTTP 200 in this Next.js version (confirmed by
    // direct HTTP testing against both `next dev` and a production
    // `next build && next start` — a long-standing App Router limitation,
    // not something scoped to this app). A genuinely *unmatched* path,
    // by contrast, gets Next's real 404 status from its own routing layer.
    // Rewriting to one lets the same not-found.tsx UI render with the
    // correct status, without duplicating that page's markup here.
    const permission = permissionForAdminPath(effectivePathname);
    const authorized = can(claims.role, 'admin:access') && (!permission || can(claims.role, permission));
    if (!authorized) {
      const url = req.nextUrl.clone();
      url.pathname = '/__admin_denied__';
      return NextResponse.rewrite(url);
    }
  }

  if (shouldPrefix) {
    const url = req.nextUrl.clone();
    url.pathname = effectivePathname;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on app routes, skip static assets and image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|icons|images).*)'],
};
