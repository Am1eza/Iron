import { NextResponse, type NextRequest } from 'next/server';
import { resolveAuthEnforced } from '@/lib/auth/authEnforced';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { can, permissionForAdminPath } from '@/lib/auth/roles';
import { resolvePanelRouting, isPanelHost } from '@/lib/server/utils/panelHost';
import {
  withInternalLocaleSegment,
  needsDefaultLocaleRewrite,
} from '@/lib/server/utils/localePath';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Cloudflare Workers build's `proxy` — a deliberately trimmed sibling of
 * `proxy.ts`, swapped in ONLY for the Workers build (see
 * `scripts/cf-proxy-swap.mjs`, invoked by the `cf:*` package.json scripts).
 *
 * Why a second file instead of one: Next.js 16's `proxy` convention is
 * ALWAYS compiled to the Node.js runtime — "The proxy runtime is nodejs, and
 * it cannot be configured" (Next 16 upgrade guide, middleware-to-proxy
 * section) — and OpenNext's Cloudflare adapter does not yet support "Node
 * Middleware" at all (its own docs list plain, Edge-runtime "Middleware" as
 * supported and "Node Middleware introduced in 15.2" as explicitly NOT yet
 * supported: https://opennext.js.org/cloudflare#supported-nextjs-features).
 * Confirmed live: every request to the Workers deployment 500'd with
 * `TypeError: Method Promise.prototype.then called on incompatible
 * receiver #<Promise>` the moment `proxy.ts` existed at all, regardless of
 * what it did — this is a capability gap, not a bug reachable by changing
 * the file's logic. The only way back to the Edge runtime is the
 * pre-Next-16 `middleware.ts` filename/export, which the same upgrade guide
 * says continues to work. This file becomes `src/middleware.ts` for the
 * Workers build only; `src/proxy.ts` (Node runtime — it queries Postgres
 * directly for the redirect table and known-paths 404 guard) keeps serving
 * the Docker/self-hosted deployment unchanged.
 *
 * Deliberately dropped vs. proxy.ts, because they need `pg` (Node-only,
 * unavailable in this Edge isolate regardless of the Worker's own
 * `nodejs_compat` flag — that flag widens the Worker's OWN runtime, not
 * Next's separately-sandboxed Edge-middleware isolate):
 *   - the admin-configured redirect table (`adminListRedirects`)
 *   - the known-paths 404 guard (`getKnownPaths`)
 *   - the legacy `/blog?page=N` archive redirect (kept out for symmetry;
 *     it's pure, but its usefulness is tied to the redirect/404 logic above)
 *   - `/proforma/[ref]` rate limiting (`rateLimit.ts` transitively imports
 *     `ioredis`/the DB rate-limit fallback — also Node-only)
 * All of these are SEO/legacy-URL conveniences, not correctness-critical,
 * and this deployment has no custom domain attached yet (GEO-ROUTING.md) —
 * zero indexed traffic depends on them today.
 *
 * KEPT, because it's genuinely security-relevant and fully Edge-safe
 * (`jose` is explicitly Edge+Node compatible; `authEnforced.ts`/`roles.ts`
 * are pure): the admin-gating logic. `authEnforced.ts`'s own history
 * matters here — this exact Workers target once served the real admin
 * shell unauthenticated because AUTH_ENFORCED was never set for it. Losing
 * this gate a second time (by shipping no proxy/middleware at all as a
 * quick fix) would reopen that hole, even though nobody can obtain a valid
 * session here today (no DATABASE_URL configured for this deployment yet).
 */

const SESSION_COOKIE = 'ahantime_at';

const AUTH_ENFORCED = resolveAuthEnforced(process.env);

// Named `middleware`, not `proxy` — this file is copied VERBATIM into
// `src/middleware.ts` by the swap script (see that file's/scripts/
// cf-proxy-swap.mjs's doc comments), and the legacy `middleware.ts`
// convention specifically requires a function named `middleware` (or a
// default export) — a `proxy`-named export there is not recognized at all.
export async function middleware(req: NextRequest) {
  const onPanelHost = isPanelHost(req.headers.get('host'));

  if (onPanelHost && req.nextUrl.pathname === '/robots.txt') {
    return new NextResponse('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain' },
    });
  }

  const { effectivePathname, shouldPrefix } = resolvePanelRouting(
    req.headers.get('host'),
    req.nextUrl.pathname,
  );

  if (AUTH_ENFORCED && !onPanelHost) {
    const p = req.nextUrl.pathname;
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

  if (AUTH_ENFORCED && effectivePathname.startsWith('/admin')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      const url = req.nextUrl.clone();
      const spent = req.nextUrl.searchParams.get('_r') === '1';
      url.pathname = spent ? '/login' : '/api/auth/silent';
      url.search = '';
      url.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    const permission = permissionForAdminPath(effectivePathname);
    const authorized =
      can(claims.role, 'admin:access') && (!permission || can(claims.role, permission));
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

  if (!onPanelHost && needsDefaultLocaleRewrite(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = withInternalLocaleSegment(req.nextUrl.pathname, DEFAULT_LOCALE);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Kept in sync with `proxy.ts`'s matcher — see that file's comment for why
  // `.*\..*` replaced the stale `fonts|icons|images` folder allowlist.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)'],
};
