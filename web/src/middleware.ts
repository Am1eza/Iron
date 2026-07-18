import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { can, permissionForAdminPath } from '@/lib/auth/roles';
import { hasDb } from '@/lib/server/db/client';
import { adminListRedirects, normalizePath } from '@/lib/server/repos/redirectsRepo';
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
const AUTH_ENFORCED = process.env.AUTH_ENFORCED === 'true'; // off in dev/mock by default

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
  }

  // Admin gating (ASCII path → safe to match here).
  if (AUTH_ENFORCED && effectivePathname.startsWith('/admin')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
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
