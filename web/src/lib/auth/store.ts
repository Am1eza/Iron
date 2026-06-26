/**
 * Auth persistence — an in-memory implementation behind small repository functions
 * (the same mock⇄live seam the API layer uses). Swap these for a DB (DATABASE_URL)
 * in production; route handlers and the service only call these functions, so the
 * swap is local. NOTE: in serverless this resets per cold start — dev only.
 */
import type { AuthUser, Role } from './types';

/* ----------------------------- users ----------------------------- */
const usersById = new Map<string, AuthUser>();
const userIdByMobile = new Map<string, string>();
let seq = 0;

function seedAdmin() {
  // A dev staff account so the admin area is reachable locally.
  const mobile = process.env.DEV_ADMIN_MOBILE ?? '09120000000';
  if (userIdByMobile.has(mobile)) return;
  const id = 'u-admin';
  const user: AuthUser = {
    id,
    mobile,
    name: 'مدیر سیستم',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
  };
  usersById.set(id, user);
  userIdByMobile.set(mobile, id);
}
seedAdmin();

export function userByMobile(mobile: string): AuthUser | null {
  const id = userIdByMobile.get(mobile);
  return id ? (usersById.get(id) ?? null) : null;
}

export function userById(id: string): AuthUser | null {
  return usersById.get(id) ?? null;
}

export function createUser(input: { mobile: string; name?: string; role?: Role }): AuthUser {
  const id = `u${Date.now().toString(36)}${++seq}`;
  const user: AuthUser = {
    id,
    mobile: input.mobile,
    name: input.name,
    role: input.role ?? 'customer',
    createdAt: new Date().toISOString(),
  };
  usersById.set(id, user);
  userIdByMobile.set(input.mobile, id);
  return user;
}

export function updateUser(id: string, patch: Partial<Pick<AuthUser, 'name'>>): AuthUser | null {
  const user = usersById.get(id);
  if (!user) return null;
  const next = { ...user, ...patch };
  usersById.set(id, next);
  return next;
}

/* ------------------------- refresh tokens ------------------------- */
type RefreshRecord = { userId: string; expiresAt: number };
const refreshByHash = new Map<string, RefreshRecord>();

export function saveRefresh(hash: string, record: RefreshRecord): void {
  refreshByHash.set(hash, record);
}

export function findRefresh(hash: string): RefreshRecord | null {
  const rec = refreshByHash.get(hash);
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    refreshByHash.delete(hash);
    return null;
  }
  return rec;
}

export function revokeRefresh(hash: string): void {
  refreshByHash.delete(hash);
}

/** Revoke every refresh token for a user (logout-all / password-style reset). */
export function revokeAllForUser(userId: string): void {
  for (const [hash, rec] of refreshByHash) {
    if (rec.userId === userId) refreshByHash.delete(hash);
  }
}

/* ------------------------------- OTP ------------------------------ */
export type OtpRecord = {
  hash: string;
  expiresAt: number;
  attempts: number;
  name?: string; // captured at request time for first-login registration
};
const otpByMobile = new Map<string, OtpRecord>();

export function setOtp(mobile: string, record: OtpRecord): void {
  otpByMobile.set(mobile, record);
}
export function getOtp(mobile: string): OtpRecord | null {
  return otpByMobile.get(mobile) ?? null;
}
export function clearOtp(mobile: string): void {
  otpByMobile.delete(mobile);
}

/* --------------------------- rate limits -------------------------- */
type RateRecord = { sends: number[]; lockedUntil?: number };
const rateByMobile = new Map<string, RateRecord>();

export function getRate(mobile: string): RateRecord {
  return rateByMobile.get(mobile) ?? { sends: [] };
}
export function setRate(mobile: string, record: RateRecord): void {
  rateByMobile.set(mobile, record);
}
