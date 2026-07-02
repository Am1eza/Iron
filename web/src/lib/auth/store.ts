/**
 * Auth persistence — a thin async facade over two interchangeable stores:
 * Postgres (production/live, when a DB is configured) and in-memory (dev/mock,
 * resets per cold start). Route handlers and the auth service only call these
 * functions, so the swap is invisible to them.
 */
import { hasDb } from '@/lib/server/db/client';
import type { AuthUser, Role } from './types';
import type { AuthStore, ListUsersQuery, OtpRecord, RateRecord, RefreshRecord, UserPatch } from './store.types';
import { memoryStore } from './store.memory';
import { pgStore } from './store.pg';

export type { OtpRecord, RateRecord, RefreshRecord, UserPatch, ListUsersQuery };

/** Resolved per call so tests can swap the DB (pglite) at runtime. */
function store(): AuthStore {
  return hasDb() ? pgStore : memoryStore;
}

/* ----------------------------- users ----------------------------- */
export function userByMobile(mobile: string): Promise<AuthUser | null> {
  return store().userByMobile(mobile);
}
export function userById(id: string): Promise<AuthUser | null> {
  return store().userById(id);
}
export function createUser(input: { mobile: string; name?: string; role?: Role }): Promise<AuthUser> {
  return store().createUser(input);
}
export function updateUser(id: string, patch: UserPatch): Promise<AuthUser | null> {
  return store().updateUser(id, patch);
}
export function listUsers(query?: ListUsersQuery): Promise<{ users: (AuthUser & { isActive?: boolean })[]; total: number }> {
  return store().listUsers(query);
}

/* ------------------------- refresh tokens ------------------------- */
export function saveRefresh(hash: string, record: RefreshRecord): Promise<void> {
  return store().saveRefresh(hash, record);
}
export function findRefresh(hash: string): Promise<RefreshRecord | null> {
  return store().findRefresh(hash);
}
export function revokeRefresh(hash: string): Promise<void> {
  return store().revokeRefresh(hash);
}
/** Revoke every refresh token for a user (logout-all / role change). */
export function revokeAllForUser(userId: string): Promise<void> {
  return store().revokeAllForUser(userId);
}

/* ------------------------------- OTP ------------------------------ */
export function setOtp(mobile: string, record: OtpRecord): Promise<void> {
  return store().setOtp(mobile, record);
}
export function getOtp(mobile: string): Promise<OtpRecord | null> {
  return store().getOtp(mobile);
}
export function clearOtp(mobile: string): Promise<void> {
  return store().clearOtp(mobile);
}

/* --------------------------- rate limits -------------------------- */
export function getRate(mobile: string): Promise<RateRecord> {
  return store().getRate(mobile);
}
export function setRate(mobile: string, record: RateRecord): Promise<void> {
  return store().setRate(mobile, record);
}
export function clearRate(mobile: string): Promise<void> {
  return store().clearRate(mobile);
}

/* ------------------------------ upkeep ---------------------------- */
export function cleanupExpiredAuth(): Promise<void> {
  return store().cleanupExpired();
}
