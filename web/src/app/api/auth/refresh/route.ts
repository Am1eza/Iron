import { NextResponse, type NextRequest } from 'next/server';
import { rotateRefresh } from '@/lib/auth/service';
import { getRefreshToken, setSessionCookies, clearSessionCookies } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/apiError';
import { assertSameOrigin } from '@/lib/auth/origin';
import { publicUser } from '@/lib/auth/publicUser';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';

/**
 * POST /api/auth/refresh — rotate the refresh token and mint a fresh access token.
 * The old refresh token is single-use; reuse fails and clears the session.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

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
