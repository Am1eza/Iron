import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware — baseline security headers + (structured) admin auth gating.
 * Note: `noindex` for admin/personal areas is set in next.config.mjs headers + robots.ts.
 * Persian-path auth gating is also enforced at the route/layout level (server components)
 * to avoid encoded-path matcher pitfalls.
 */
const SESSION_COOKIE = 'poladin_session';
const AUTH_ENFORCED = process.env.AUTH_ENFORCED === 'true'; // off in dev/mock by default

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Baseline security headers (CSP added in a later hardening pass).
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // Admin gating (ASCII path → safe to match here).
  if (AUTH_ENFORCED && req.nextUrl.pathname.startsWith('/admin')) {
    const hasSession = req.cookies.has(SESSION_COOKIE);
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = '/ورود';
      url.searchParams.set('next', req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  // Run on app routes, skip static assets and image optimizer.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|icons|images).*)'],
};
