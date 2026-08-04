/**
 * Auth tables — the Postgres home of the repository seam in `lib/auth/store.ts`.
 * Shapes mirror the in-memory records exactly (epoch-ms numbers for expiries)
 * so `store.pg.ts` is a thin translation layer.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const ROLES = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'] as const;
export const CLUB_TIERS = ['iron', 'steel', 'poolad'] as const;
/** Progressive identity-verification status per level (self-attested → admin review). */
export const VERIFY_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;

/** Buyers + staff in one table; `role` drives RBAC (matches AuthUser). */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    mobile: text('mobile').notNull().unique(),
    // `name` is the display name (kept for back-compat + admin/proforma use);
    // firstName/lastName are the structured fields captured at registration.
    name: text('name'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    role: text('role', { enum: ROLES }).notNull().default('customer'),
    isActive: boolean('is_active').notNull().default(true),
    // Bumped whenever role/isActive changes (see store.pg.ts#updateUser).
    // Embedded in the access-token JWT (`tv` claim) and compared against this
    // column on every permission-gated request, so a demoted/deactivated
    // staff member's already-issued token stops working immediately instead
    // of staying valid until its natural expiry — which is 4 HOURS
    // (CONSTANTS.ACCESS_TTL_SECONDS), not the 15 minutes this comment used to
    // claim. The gap between those two numbers is exactly why this column is
    // load-bearing rather than a nicety.
    tokenVersion: integer('token_version').notNull().default(0),

    /* ---- progressive identity verification (level 1 = phone/OTP, always) ---- */
    // Level 2 — personal: کد ملی (10-digit national ID), self-attested then
    // admin-approved. verificationLevel is DERIVED (see verificationRepo), not
    // stored, so the two status columns are the single source of truth.
    nationalId: text('national_id'),
    idVerifyStatus: text('id_verify_status', { enum: VERIFY_STATUSES }).notNull().default('none'),
    // Level 3 — business (KYB): شناسه ملی (11-digit legal-entity id), کد اقتصادی
    // (12-digit tax code), company name. Self-attested then admin-approved.
    companyName: text('company_name'),
    companyNationalId: text('company_national_id'),
    economicCode: text('economic_code'),
    bizVerifyStatus: text('biz_verify_status', { enum: VERIFY_STATUSES }).notNull().default('none'),

    /* ---- referral / invite ---- */
    // Each user's own shareable code; a new user may enter someone else's at
    // registration → referredBy. Feeds club points on a qualified referral.
    inviteCode: text('invite_code').unique(),
    // Self-FK (W29): this was the ONE user-id column in the schema with no
    // referential integrity — nothing stopped a deleted referrer from leaving
    // a dangling id here, and the club-points path reads it. `set null` (not
    // cascade): losing the referrer must never delete the referred account.
    // The lazy `(): AnyPgColumn =>` form is required for a self-reference —
    // `users` is not yet initialised at the point this callback is declared.
    referredBy: text('referred_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('customer','operator','sales','content','catalog','admin')`),
    index('users_id_verify_idx').on(t.idVerifyStatus),
    index('users_biz_verify_idx').on(t.bizVerifyStatus),
    index('users_referred_by_idx').on(t.referredBy),
    // Analytics cohort/KPI windows (`WHERE created_at >= …`) over the whole
    // users table — no index on the column they window on (W29).
    index('users_created_idx').on(t.createdAt),
  ],
);

/**
 * Rotating opaque refresh tokens, stored hashed. Epoch-ms expiry like the
 * memory store.
 *
 * TOKEN FAMILIES (W29, audit area 2). A rotated token used to be DELETED, so a
 * presented-but-already-spent token and a token that never existed were the
 * same 401 — reuse of a stolen token was undetectable, and the victim's own
 * re-login did not evict the thief. Rotation now KEEPS the row and stamps
 * `rotatedAt`; every descendant carries the root's `familyId`, so presenting a
 * spent token identifies the whole lineage to kill.
 *
 * All three columns are NULLABLE on purpose: the migration is additive and
 * every session that predates it keeps working (a NULL `familyId` simply means
 * "this token is its own family root" — see auth/service.ts#rotateRefresh).
 * Rows are no longer removed at rotation, only at expiry (cleanupExpired), so
 * the reuse window is the token's full lifetime rather than "until the next
 * rotation".
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    // A deleted account's sessions must go with it, not linger as orphans.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
    /** Root token hash of this lineage — the unit that reuse detection kills. */
    familyId: text('family_id'),
    /** The token this one was minted from (forensics; not read by the guard). */
    parentHash: text('parent_hash'),
    /** Epoch ms this token was spent. NULL = still live/unrotated. */
    rotatedAt: bigint('rotated_at', { mode: 'number' }),
  },
  (t) => [
    index('refresh_tokens_user_idx').on(t.userId),
    // revokeFamily() is on the hot path of a detected reuse — never a scan.
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);

/**
 * Admin allowlist — THE source of truth for who may hold the `admin` role.
 * Login (verifyOtp) auto-promotes an allowlisted mobile to admin; removing a
 * row demotes that user in the same request (fail-closed: no row → no admin).
 * Bootstrapped from the ADMIN_MOBILES env at seed time; managed afterwards
 * from /admin/users. Every change is audited.
 */
export const adminAllowlist = pgTable(
  'admin_allowlist',
  {
    mobile: text('mobile').primaryKey(), // normalized 09xxxxxxxxx
    label: text('label'),
    /**
     * The staff role this mobile is granted at login. Generalizes what began as
     * an admins-only list into THE staff access registry: a number that is not
     * in this table can hold no staff role and cannot request a panel OTP at
     * all. 'admin' is the default so rows predating this column keep their
     * historical meaning. (The table name is deliberately unchanged — renaming
     * a live table buys nothing and breaks concurrent work on this repo.)
     */
    role: text('role', { enum: ['operator', 'sales', 'content', 'catalog', 'admin'] })
      .notNull()
      .default('admin'),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // FK with no covering index (W29): every DELETE/UPDATE on `users` must scan
  // this table to enforce the ON DELETE SET NULL.
  (t) => [index('admin_allowlist_added_by_idx').on(t.addedBy)],
);

/** One active OTP per mobile (upsert semantics, matches `setOtp`).
 *  prev_* keep the previous still-unexpired code valid through a resend —
 *  SMS delivery to Iranian MVNOs can lag ~5 minutes, and without this the
 *  resend invalidates the code that then arrives. */
export const otpCodes = pgTable('otp_codes', {
  mobile: text('mobile').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  name: text('name'),
  prevHash: text('prev_hash'),
  prevExpiresAt: bigint('prev_expires_at', { mode: 'number' }),
});

/** OTP send rate-limiting, mirrors RateRecord `{ sends: number[], lockedUntil? }`. */
export const otpRateLimits = pgTable('otp_rate_limits', {
  mobile: text('mobile').primaryKey(),
  sends: jsonb('sends').$type<number[]>().notNull().default([]),
  lockedUntil: bigint('locked_until', { mode: 'number' }),
});
