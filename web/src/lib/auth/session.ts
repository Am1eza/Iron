/**
 * Session cookies + server-side session resolution. The access JWT lives in an
 * httpOnly cookie (read by server components/middleware); the refresh token in a
 * separate httpOnly cookie scoped to `/api/auth` (used only to mint new access
 * tokens). Cookies are Secure in production and SameSite=Lax (CSRF-resistant).
 * Server-only (uses next/headers).
 */
import { cookies } from 'next/headers';
import { verifyAccessToken } from './jwt';
import { userById } from './store';
import { reportError } from '@/lib/errors/report';
import type { AccessTokenClaims, AuthUser, IssuedTokens } from './types';

export const ACCESS_COOKIE = 'ahantime_at';
export const REFRESH_COOKIE = 'ahantime_rt';

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

/** Shared by getSession()/getSessionVerified() so the EXPORT-mode guard and
 *  cookie/JWT resolution only exist in one place. */
async function resolveClaims(): Promise<AccessTokenClaims | null> {
  // Static export (GitHub Pages preview) has no request context / cookies —
  // render the anonymous (logged-out) state so pages can prerender statically.
  if (process.env.EXPORT === '1') return null;
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

/**
 * Resolve the session from the access cookie (verify the JWT). Returns a minimal
 * user view or null. Does NOT auto-refresh — that's the client/refresh endpoint's
 * job — so this stays cheap and Edge-safe.
 */
export async function getSession(): Promise<AuthUser | null> {
  const claims = await resolveClaims();
  if (!claims) return null;
  return {
    id: claims.sub,
    mobile: claims.mobile,
    name: claims.name,
    role: claims.role,
    createdAt: '',
  };
}

/**
 * Like `getSession()`, but also re-checks the DB: rejects the session if the
 * user was deactivated or their role changed since this access token was
 * issued (tokenVersion mismatch — see schema/auth.ts), instead of trusting
 * the JWT's claims for its full ~15min lifetime regardless. One extra
 * indexed lookup, so use this at actual permission/authorization boundaries
 * (requireApiUser/requirePermission and friends), not on every page render.
 *
 * If the DB lookup itself fails (connection blip, not "user not found"), this
 * falls back to the JWT-only result instead of throwing — a transient outage
 * degrades to getSession()'s pre-existing trust window rather than taking
 * down every admin page/route that calls this.
 */
export async function getSessionVerified(): Promise<AuthUser | null> {
  const claims = await resolveClaims();
  if (!claims) return null;
  const fallback: AuthUser = {
    id: claims.sub,
    mobile: claims.mobile,
    name: claims.name,
    role: claims.role,
    createdAt: '',
  };
  try {
    const current = await userById(claims.sub);
    if (!current || (current.tokenVersion ?? 0) !== (claims.tv ?? 0)) return null;
    return current;
  } catch (err) {
    reportError(err, { scope: 'auth', fn: 'getSessionVerified' });
    return fallback;
  }
}
