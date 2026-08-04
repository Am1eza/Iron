/**
 * Shapes shared by the auth store implementations (memory ⇄ Postgres).
 * The facade in store.ts picks the implementation at call time.
 */
import type { AuthUser, Role } from './types';

/**
 * One refresh token row. `familyId`/`parentHash`/`rotatedAt` implement reuse
 * detection (W29) and are all optional: rows issued before the feature landed
 * have none of them and are treated as their own single-token family, so no
 * existing session is invalidated by the upgrade.
 */
export type RefreshRecord = {
  userId: string;
  expiresAt: number;
  /** Root token hash of the rotation lineage. */
  familyId?: string;
  /** The token this one replaced. */
  parentHash?: string;
  /** Epoch ms this token was spent by a rotation. Undefined = still live. */
  rotatedAt?: number;
};

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

export type UserPatch = Partial<Pick<AuthUser, 'name' | 'firstName' | 'lastName' | 'role' | 'mobile'>> & {
  isActive?: boolean;
  lastSeenAt?: string;
};

export type CreateUserInput = {
  mobile: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  inviteCode?: string; // this user's own generated code (store generates if omitted)
  referredBy?: string; // referrer's user id
};

export type ListUsersQuery = { role?: Role; q?: string; page?: number; perPage?: number };

export interface AuthStore {
  userByMobile(mobile: string): Promise<AuthUser | null>;
  userById(id: string): Promise<AuthUser | null>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  updateUser(id: string, patch: UserPatch): Promise<AuthUser | null>;
  listUsers(query?: ListUsersQuery): Promise<{ users: (AuthUser & { isActive?: boolean })[]; total: number }>;

  saveRefresh(hash: string, record: RefreshRecord): Promise<void>;
  /**
   * Read a token row WITHOUT spending it. Returns already-rotated rows too
   * (that is the whole point — `rotatedAt` is what distinguishes "spent" from
   * "never existed"), and still returns null for an unknown or expired hash.
   */
  findRefresh(hash: string): Promise<RefreshRecord | null>;
  /**
   * ATOMICALLY spend a token: stamp `rotatedAt` if and only if it is still
   * NULL and the row is unexpired, returning the row that was claimed (null
   * if there was nothing to claim). Must be one statement — a read-then-write
   * would let two concurrent silent-refreshes both believe they were the sole
   * rotator, and, worse, let a genuine reuse slip through as a normal
   * rotation. See auth/service.ts#rotateRefresh for the race analysis.
   */
  claimRefresh(hash: string, rotatedAt: number): Promise<RefreshRecord | null>;
  revokeRefresh(hash: string): Promise<void>;
  /** Kill an entire rotation lineage (reuse detected / logout). */
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  /** Full session kill for an admin "revoke sessions" action (US-21.3):
   *  clears refresh tokens (revokeAllForUser's effect) AND bumps
   *  tokenVersion so an already-issued access token is rejected on its very
   *  next request too — revokeAllForUser alone only stops future refreshes;
   *  the still-live access token (4 hours — CONSTANTS.ACCESS_TTL_SECONDS,
   *  not the 15 minutes this comment used to say) keeps working until it
   *  naturally expires. Distinct from updateUser's role/isActive bump: this
   *  fires on demand with no other field change. */
  revokeSessionsForUser(userId: string): Promise<void>;

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
