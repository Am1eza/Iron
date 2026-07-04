/**
 * Access-token JWT (HS256 via `jose` — Edge + Node compatible). Short-lived; the
 * source of truth for "who is this request" once verified. Signed with
 * SESSION_SECRET (required in live mode; a loud dev fallback otherwise).
 */
import { SignJWT, jwtVerify } from 'jose';
import { requiredSecret } from './crypto';
import type { AccessTokenClaims } from './types';

const ISSUER = 'ahantime';
const AUDIENCE = 'ahantime-web';

function getSecret(): Uint8Array {
  // Dev-only fallback so the flow runs locally without config.
  const secret = requiredSecret(process.env.SESSION_SECRET, 'dev-insecure-secret-change-me-0000000000');
  return new TextEncoder().encode(secret);
}

/** Sign an access token. `ttlSeconds` controls expiry (default 15 min). */
export async function signAccessToken(
  claims: AccessTokenClaims,
  ttlSeconds = 15 * 60,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = await new SignJWT({ mobile: claims.mobile, role: claims.role, name: claims.name, tv: claims.tv ?? 0 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());
  return { token, expiresAt: exp * 1000 };
}

/** Verify + decode an access token. Returns null on any failure (expired/tampered). */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return {
      sub: payload.sub,
      mobile: String(payload.mobile ?? ''),
      role: payload.role as AccessTokenClaims['role'],
      name: payload.name ? String(payload.name) : undefined,
      // Tokens signed before this field existed have no `tv` claim — treat
      // them as version 0, matching the column's default, so already-issued
      // tokens keep working until the next role/isActive change bumps it.
      tv: typeof payload.tv === 'number' ? payload.tv : 0,
    };
  } catch {
    return null;
  }
}
