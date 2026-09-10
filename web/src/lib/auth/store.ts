/**
 * Auth persistence — a thin async facade over two interchangeable stores:
 * Postgres (production/live, when a DB is configured) and in-memory (dev/mock,
 * resets per cold start). Route handlers and the auth service only call these
 * functions, so the swap is invisible to them.
 */
import { hasDb, type DbOrTx } from '@/lib/server/db/client';
import type { AuthUser } from './types';
import type {
  AuthStore,
  CreateUserInput,
  ListUsersQuery,
  OtpRecord,
  RateRecord,
  OtpSendClaim,
  RefreshRotation,
  RefreshRecord,
  UserPatch,
} from './store.types';
import { memoryStore } from './store.memory';
import { pgStore } from './store.pg';

export type { CreateUserInput, OtpRecord, RateRecord, OtpSendClaim, RefreshRecord, RefreshRotation, UserPatch, ListUsersQuery };

/** Resolved per call so tests can swap the DB (pglite) at runtime. */
function store(): AuthStore {
  if (hasDb()) return pgStore;
  if (process.env.NODE_ENV === 'production') throw new Error('Auth database is required in production.');
  return memoryStore;
}

/* ----------------------------- users ----------------------------- */
export function userByMobile(mobile: string, tx?: DbOrTx): Promise<AuthUser | null> {
  return store().userByMobile(mobile, tx);
}
export function userById(id: string, tx?: DbOrTx): Promise<AuthUser | null> {
  return store().userById(id, tx);
}
export function createUser(input: CreateUserInput): Promise<AuthUser> {
  return store().createUser(input);
}
export function updateUser(id: string, patch: UserPatch, tx?: DbOrTx): Promise<AuthUser | null> {
  return store().updateUser(id, patch, tx);
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
/** Atomically spend a token — see store.types.ts#claimRefresh. */
export function claimRefresh(hash: string, rotatedAt: number): Promise<RefreshRecord | null> {
  return store().claimRefresh(hash, rotatedAt);
}
export function rotateRefreshAtomic(parentHash: string, childHash: string, child: RefreshRecord, now: number, graceMs: number, enforceReuse: boolean) {
  return store().rotateRefreshAtomic(parentHash, childHash, child, now, graceMs, enforceReuse);
}
export function revokeRefresh(hash: string): Promise<void> {
  return store().revokeRefresh(hash);
}
/** Kill a whole rotation lineage (reuse detected, or logout). */
export function revokeFamily(familyId: string): Promise<void> {
  return store().revokeFamily(familyId);
}
/** Revoke every refresh token for a user (logout-all / role change). */
export function revokeAllForUser(userId: string): Promise<void> {
  return store().revokeAllForUser(userId);
}
/** Full session kill (US-21.3 admin "revoke sessions" action) — refresh
 *  tokens AND tokenVersion, see store.types.ts's AuthStore doc comment. */
export function revokeSessionsForUser(userId: string): Promise<void> {
  return store().revokeSessionsForUser(userId);
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
export function consumeOtp(mobile: string, hash: string, expiresAt: number): Promise<boolean> {
  return store().consumeOtp(mobile, hash, expiresAt);
}
export function incrementOtpAttempts(mobile: string): Promise<OtpRecord | null> {
  return store().incrementOtpAttempts(mobile);
}

/* --------------------------- rate limits -------------------------- */
export function getRate(mobile: string): Promise<RateRecord> {
  return store().getRate(mobile);
}
export function setRate(mobile: string, record: RateRecord): Promise<void> {
  return store().setRate(mobile, record);
}
export function claimOtpSend(mobile: string, now: number, cooldownMs: number, windowMs: number, maxSends: number, combinedKey?: string) {
  return store().claimOtpSend(mobile, now, cooldownMs, windowMs, maxSends, combinedKey);
}
export function clearRate(mobile: string): Promise<void> {
  return store().clearRate(mobile);
}

/* ------------------------------ upkeep ---------------------------- */
export function cleanupExpiredAuth(): Promise<void> {
  return store().cleanupExpired();
}
