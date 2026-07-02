/**
 * Auth domain types. Ahantime uses passwordless **mobile + OTP** auth (locked
 * product decision; SMS.ir Verify API). Access is a short-lived JWT; sessions are
 * refreshed with a rotating opaque refresh token. Roles drive RBAC for admin.
 */

/** Application roles. `customer` is the default; the rest are staff (admin area). */
export type Role = 'customer' | 'operator' | 'sales' | 'content' | 'catalog' | 'admin';

/** Fine-grained capabilities checked via `can()` (see roles.ts). */
export type Permission =
  | 'pricing:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'market:write'
  | 'leads:read'
  | 'leads:write'
  | 'content:write'
  | 'content:publish'
  | 'club:manage'
  | 'users:manage'
  | 'settings:write'
  | 'audit:read'
  | 'admin:access';

export interface AuthUser {
  id: string;
  mobile: string;
  name?: string;
  role: Role;
  clubTier?: 'iron' | 'steel' | 'poolad';
  createdAt: string;
}

/** The signed JWT payload (kept minimal — no PII beyond the mobile). */
export interface AccessTokenClaims {
  sub: string; // user id
  mobile: string;
  role: Role;
  name?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: number; // epoch ms
  refreshToken: string;
  refreshExpiresAt: number; // epoch ms
}
