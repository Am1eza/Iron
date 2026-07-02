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
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);

/** One active OTP per mobile (upsert semantics, matches `setOtp`). */
export const otpCodes = pgTable('otp_codes', {
  mobile: text('mobile').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  name: text('name'),
});

/** OTP send rate-limiting, mirrors RateRecord `{ sends: number[], lockedUntil? }`. */
export const otpRateLimits = pgTable('otp_rate_limits', {
  mobile: text('mobile').primaryKey(),
  sends: jsonb('sends').$type<number[]>().notNull().default([]),
  lockedUntil: bigint('locked_until', { mode: 'number' }),
});
