/**
 * Shapes shared by the auth store implementations (memory ⇄ Postgres).
 * The facade in store.ts picks the implementation at call time.
 */
import type { AuthUser, Role } from './types';

export type RefreshRecord = { userId: string; expiresAt: number };

export type OtpRecord = {
  hash: string;
  expiresAt: number;
  attempts: number;
  name?: string; // captured at request time for first-login registration
};

export type RateRecord = { sends: number[]; lockedUntil?: number };

export type UserPatch = Partial<Pick<AuthUser, 'name' | 'role'>> & {
  isActive?: boolean;
  lastSeenAt?: string;
};

export type ListUsersQuery = { role?: Role; q?: string; page?: number; perPage?: number };

export interface AuthStore {
  userByMobile(mobile: string): Promise<AuthUser | null>;
  userById(id: string): Promise<AuthUser | null>;
  createUser(input: { mobile: string; name?: string; role?: Role }): Promise<AuthUser>;
  updateUser(id: string, patch: UserPatch): Promise<AuthUser | null>;
  listUsers(query?: ListUsersQuery): Promise<{ users: AuthUser[]; total: number }>;

  saveRefresh(hash: string, record: RefreshRecord): Promise<void>;
  findRefresh(hash: string): Promise<RefreshRecord | null>;
  revokeRefresh(hash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;

  setOtp(mobile: string, record: OtpRecord): Promise<void>;
  getOtp(mobile: string): Promise<OtpRecord | null>;
  clearOtp(mobile: string): Promise<void>;

  getRate(mobile: string): Promise<RateRecord>;
  setRate(mobile: string, record: RateRecord): Promise<void>;
  clearRate(mobile: string): Promise<void>;

  /** Purge expired OTPs / refresh tokens / stale rate rows (cleanup job). */
  cleanupExpired(): Promise<void>;
}
