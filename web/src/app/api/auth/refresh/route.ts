import { NextResponse, type NextRequest } from 'next/server';
import { rotateRefresh } from '@/lib/auth/service';
import { getRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/apiError';
import { assertSameOrigin } from '@/lib/auth/origin';
import { publicUser } from '@/lib/auth/publicUser';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';

/**
 * POST /api/auth/refresh — rotate the refresh token and mint a fresh access token.
 * The old refresh token is single-use; reuse fails and clears the session.
 *
 * H-185: rotation does real DB transaction work (a row lock + update) per
 * call, and a request carrying ANY still-valid refresh cookie reaches it —
 * unlike otp-request/otp-verify, no per-mobile budget bounds how often one
 * already-authenticated client can trigger it. A generous per-IP limit (well
 * above any real silent-refresh cadence) stops that from becoming a free DB
 * hammer without affecting normal use.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'auth-refresh', { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: 'no_session', message: 'نشستی یافت نشد.' }, { status: 401 });
  }

  try {
    const { user, tokens } = await rotateRefresh(refreshToken);
    await setSessionCookies(tokens);
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    await clearSessionCookies();
    return authErrorResponse(err);
  }
}

export const POST = withApiErrorHandling(POSTImpl);
