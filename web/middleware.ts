import { NextResponse, type NextRequest } from 'next/server';

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

export function middleware(req: NextRequest) {
  // Admin gating (ASCII path → safe to match here).
  if (AUTH_ENFORCED && req.nextUrl.pathname.startsWith('/admin')) {
    const hasSession = req.cookies.has(SESSION_COOKIE);
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on app routes, skip static assets and image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|icons|images).*)'],
};
