import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { can, permissionForAdminPath } from '@/lib/auth/roles';

/**
 * Middleware — (structured) admin auth gating only.
 * Security response headers (CSP, X-Frame-Options, HSTS, ...) live in
 * `next.config.mjs`'s `headers()` — the single source of truth. They used
 * to be duplicated here too, which is exactly how X-Frame-Options ended up
 * set to two different values (DENY vs SAMEORIGIN) from two layers.
 * Note: `noindex` for admin/personal areas is set in next.config.mjs headers + robots.ts.
 * Persian-path auth gating is also enforced at the route/layout level (server components)
 * to avoid encoded-path matcher pitfalls.
 */
const SESSION_COOKIE = 'ahantime_at'; // access-token cookie (lib/auth/session)
const AUTH_ENFORCED = process.env.AUTH_ENFORCED === 'true'; // off in dev/mock by default

export async function middleware(req: NextRequest) {
  // Admin gating (ASCII path → safe to match here).
  if (AUTH_ENFORCED && req.nextUrl.pathname.startsWith('/admin')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
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
    const permission = permissionForAdminPath(req.nextUrl.pathname);
    const authorized = can(claims.role, 'admin:access') && (!permission || can(claims.role, permission));
    if (!authorized) {
      const url = req.nextUrl.clone();
      url.pathname = '/__admin_denied__';
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on app routes, skip static assets and image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|icons|images).*)'],
};
