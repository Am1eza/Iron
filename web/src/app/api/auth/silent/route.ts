import { NextResponse, type NextRequest } from 'next/server';
import { rotateRefresh } from '@/lib/auth/service';
import { getRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/auth/session';
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
async function GETImpl(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('next') ?? '/';
  // Only a path — never a scheme/host, and never protocol-relative (`//evil`).
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = `?next=${encodeURIComponent(next)}`;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return NextResponse.redirect(loginUrl);

  try {
    const { tokens } = await rotateRefresh(refreshToken);
    await setSessionCookies(tokens);
    const back = req.nextUrl.clone();
    back.pathname = next;
    // Marks this hop as spent: if the fresh cookie somehow doesn't stick,
    // middleware sees the marker and goes to /login instead of bouncing
    // through here forever.
    back.search = '?_r=1';
    return NextResponse.redirect(back);
  } catch {
    await clearSessionCookies();
    return NextResponse.redirect(loginUrl);
  }
}

export const GET = withApiErrorHandling(GETImpl);
