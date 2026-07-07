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
  /** The PREVIOUS still-unexpired code, kept valid through a resend. SMS
   *  delivery to Iranian MVNOs can lag ~5 minutes; without this, a resend
   *  invalidates the code that then arrives and the user can never log in. */
  prevHash?: string;
  prevExpiresAt?: number;
};

export type RateRecord = { sends: number[]; lockedUntil?: number };

export type UserPatch = Partial<Pick<AuthUser, 'name' | 'role' | 'mobile'>> & {
  isActive?: boolean;
  lastSeenAt?: string;
};

export type ListUsersQuery = { role?: Role; q?: string; page?: number; perPage?: number };

export interface AuthStore {
  userByMobile(mobile: string): Promise<AuthUser | null>;
  userById(id: string): Promise<AuthUser | null>;
  createUser(input: { mobile: string; name?: string; role?: Role }): Promise<AuthUser>;
  updateUser(id: string, patch: UserPatch): Promise<AuthUser | null>;
  listUsers(query?: ListUsersQuery): Promise<{ users: (AuthUser & { isActive?: boolean })[]; total: number }>;

  saveRefresh(hash: string, record: RefreshRecord): Promise<void>;
  findRefresh(hash: string): Promise<RefreshRecord | null>;
  revokeRefresh(hash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;

  setOtp(mobile: string, record: OtpRecord): Promise<void>;
  getOtp(mobile: string): Promise<OtpRecord | null>;
  clearOtp(mobile: string): Promise<void>;
  /** Atomically increments the attempt counter and returns the updated
   *  record (hash/expiresAt/name included, so callers don't need a separate
   *  getOtp round trip) in one shot — no read-then-write window where
   *  concurrent verify requests for the same mobile could all observe the
   *  same `attempts` value and bypass the lockout. `null` if there's no OTP
   *  record for this mobile. */
  incrementOtpAttempts(mobile: string): Promise<OtpRecord | null>;

  getRate(mobile: string): Promise<RateRecord>;
  setRate(mobile: string, record: RateRecord): Promise<void>;
  clearRate(mobile: string): Promise<void>;

  /** Purge expired OTPs / refresh tokens / stale rate rows (cleanup job). */
  cleanupExpired(): Promise<void>;
}
