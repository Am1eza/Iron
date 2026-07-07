/**
 * Auth tables — the Postgres home of the repository seam in `lib/auth/store.ts`.
 * Shapes mirror the in-memory records exactly (epoch-ms numbers for expiries)
 * so `store.pg.ts` is a thin translation layer.
 */
import { sql } from 'drizzle-orm';
import {
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

/** Buyers + staff in one table; `role` drives RBAC (matches AuthUser). */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    mobile: text('mobile').notNull().unique(),
    name: text('name'),
    role: text('role', { enum: ROLES }).notNull().default('customer'),
    isActive: boolean('is_active').notNull().default(true),
    // Bumped whenever role/isActive changes (see store.pg.ts#updateUser).
    // Embedded in the access-token JWT (`tv` claim) and compared against this
    // column on every permission-gated request, so a demoted/deactivated
    // staff member's already-issued token stops working immediately instead
    // of staying valid until its natural (default 15min) expiry.
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [check('users_role_check', sql`${t.role} IN ('customer','operator','sales','content','catalog','admin')`)],
);

/** Rotating opaque refresh tokens, stored hashed. Epoch-ms expiry like the memory store. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    // A deleted account's sessions must go with it, not linger as orphans.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);

/**
 * Admin allowlist — THE source of truth for who may hold the `admin` role.
 * Login (verifyOtp) auto-promotes an allowlisted mobile to admin; removing a
 * row demotes that user in the same request (fail-closed: no row → no admin).
 * Bootstrapped from the ADMIN_MOBILES env at seed time; managed afterwards
 * from /admin/users. Every change is audited.
 */
export const adminAllowlist = pgTable('admin_allowlist', {
  mobile: text('mobile').primaryKey(), // normalized 09xxxxxxxxx
  label: text('label'),
  addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
