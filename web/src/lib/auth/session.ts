/**
 * Session cookies + server-side session resolution. The access JWT lives in an
 * httpOnly cookie (read by server components/middleware); the refresh token in a
 * separate httpOnly cookie scoped to `/api/auth` (used only to mint new access
 * tokens). Cookies are Secure in production and SameSite=Lax (CSRF-resistant).
 * Server-only (uses next/headers).
 */
import { cookies } from 'next/headers';
import { verifyAccessToken } from './jwt';
import type { AuthUser, IssuedTokens } from './types';

export const ACCESS_COOKIE = 'poladin_at';
export const REFRESH_COOKIE = 'poladin_rt';

const isProd = process.env.NODE_ENV === 'production';

function baseCookie(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** Write both session cookies from freshly-issued tokens. */
export async function setSessionCookies(tokens: IssuedTokens): Promise<void> {
  const jar = await cookies();
  const accessMaxAge = Math.max(1, Math.floor((tokens.accessExpiresAt - Date.now()) / 1000));
  const refreshMaxAge = Math.max(1, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000));
  jar.set(ACCESS_COOKIE, tokens.accessToken, baseCookie(accessMaxAge));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie(refreshMaxAge),
    path: '/api/auth', // refresh token is only ever sent to the auth endpoints
  });
}

/** Clear both session cookies (logout). */
export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, '', { ...baseCookie(0), maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...baseCookie(0), path: '/api/auth', maxAge: 0 });
}

/** Read the current refresh token (auth endpoints only). */
export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/**
 * Resolve the session from the access cookie (verify the JWT). Returns a minimal
 * user view or null. Does NOT auto-refresh — that's the client/refresh endpoint's
 * job — so this stays cheap and Edge-safe.
 */
export async function getSession(): Promise<AuthUser | null> {
  // Static export (GitHub Pages preview) has no request context / cookies —
  // render the anonymous (logged-out) state so pages can prerender statically.
  if (process.env.EXPORT === '1') return null;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return {
    id: claims.sub,
    mobile: claims.mobile,
    name: claims.name,
    role: claims.role,
    createdAt: '',
  };
}
