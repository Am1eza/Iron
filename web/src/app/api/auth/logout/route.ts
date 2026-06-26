import { NextResponse, type NextRequest } from 'next/server';
import { logout } from '@/lib/auth/service';
import { getRefreshToken, clearSessionCookies } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';

/** POST /api/auth/logout — revoke the refresh token and clear session cookies. */
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;

  const refreshToken = await getRefreshToken();
  await logout(refreshToken);
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
