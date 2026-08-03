import { NextResponse, type NextRequest } from 'next/server';
import { rotateRefresh } from '@/lib/auth/service';
import { getRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/routes';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/**
 * GET /api/auth/silent?next=… — recover an expired access cookie from the
 * (still valid, 30-day) refresh cookie and bounce back to where the user was
 * going. Middleware sends navigations here instead of straight to /login.
 *
 * Why this exists: the refresh cookie is path-scoped to /api/auth, so the
 * browser never sends it with a page request — middleware literally cannot
 * see it and used to conclude "no session" and demand a new OTP. Staff were
 * re-logging in (and paying for an SMS) after every short break. This route
 * IS under /api/auth, so it receives the cookie, rotates it, and redirects
 * back with a fresh access cookie — no code, no SMS, no interruption.
 *
 * `next` is constrained to a same-site absolute path so this can't be used as
 * an open redirect. A failed rotation clears the session and falls through to
 * the login page carrying the same `next`.
 */
/**
 * RELATIVE Location on purpose. `NextResponse.redirect` needs an absolute URL,
 * and inside a route handler behind the reverse proxy `req.nextUrl` resolves
 * to the container's own address — this route was verified redirecting to
 * `https://0.0.0.0:3000/login`, which no browser can follow. A relative
 * Location (RFC 7231 §7.1.2) is resolved by the browser against the request it
 * just made, so the user stays on whichever host they were already on
 * (panel.ahantime.com or the site) with no host detection at all.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

async function GETImpl(req: NextRequest) {
  // Only a path — never a scheme/host, never protocol-relative (`//evil`), and
  // never a backslash form (`/\evil.com`, which browsers normalise to `//`).
  // See safeNextPath's docblock; this route runs right after a successful
  // refresh-token rotation, so an open redirect here is a phishing hop that
  // both starts and ends inside a legitimate authentication flow.
  const next = safeNextPath(req.nextUrl.searchParams.get('next')) ?? '/';
  const loginPath = `/login?next=${encodeURIComponent(next)}`;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return redirectTo(loginPath);

  try {
    const { tokens } = await rotateRefresh(refreshToken);
    await setSessionCookies(tokens);
    // `_r=1` marks this hop as spent: if the fresh cookie somehow doesn't
    // stick, middleware sees the marker and goes to /login instead of
    // bouncing through here forever.
    const sep = next.includes('?') ? '&' : '?';
    return redirectTo(`${next}${sep}_r=1`);
  } catch {
    await clearSessionCookies();
    return redirectTo(loginPath);
  }
}

export const GET = withApiErrorHandling(GETImpl);
