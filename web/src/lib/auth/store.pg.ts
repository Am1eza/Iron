/**
 * Postgres auth store — Drizzle against users/refresh_tokens/otp_codes/
 * otp_rate_limits. Same contract as the memory store; sessions and accounts
 * survive restarts and scale across instances.
 */
import { and, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb } from '@/lib/server/db/client';
import { users, refreshTokens, otpCodes, otpRateLimits, clubMemberships } from '@/lib/server/db/schema';
import { randomInviteCode } from './crypto';
import type { AuthUser } from './types';
import type { AuthStore, CreateUserInput, ListUsersQuery, UserPatch } from './store.types';

type UserRow = typeof users.$inferSelect;

function toAuthUser(row: UserRow, clubTier?: 'iron' | 'steel' | 'poolad' | null): AuthUser {
  return {
    id: row.id,
    mobile: row.mobile,
    name: row.name ?? undefined,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    role: row.role,
    clubTier: clubTier ?? undefined,
    createdAt: row.createdAt.toISOString(),
    tokenVersion: row.tokenVersion,
  };
}

async function userWhere(cond: ReturnType<typeof eq>): Promise<AuthUser | null> {
  const db = getDb();
  const rows = await db
    .select({ user: users, tier: clubMemberships.tier })
    .from(users)
    .leftJoin(clubMemberships, eq(clubMemberships.userId, users.id))
    .where(cond)
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.isActive) return null;
  return toAuthUser(row.user, row.tier);
}

export const pgStore: AuthStore = {
  userByMobile(mobile: string) {
    return userWhere(eq(users.mobile, mobile));
  },

  userById(id: string) {
    return userWhere(eq(users.id, id));
  },

  async createUser(input: CreateUserInput) {
    const db = getDb();
    const composed =
      input.name ?? ([input.firstName, input.lastName].filter(Boolean).join(' ').trim() || null);
    const row = {
      id: ulid(),
      mobile: input.mobile,
      name: composed,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      role: input.role ?? 'customer',
      inviteCode: input.inviteCode ?? randomInviteCode(),
      referredBy: input.referredBy ?? null,
    } as const;
    const inserted = await db.insert(users).values(row).returning();
    return toAuthUser(inserted[0]!);
  },

  async updateUser(id: string, patch: UserPatch) {
    const db = getDb();
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.firstName !== undefined) set.firstName = patch.firstName;
    if (patch.lastName !== undefined) set.lastName = patch.lastName;
    if (patch.mobile !== undefined) set.mobile = patch.mobile;
    if (patch.role !== undefined) set.role = patch.role;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    if (patch.lastSeenAt !== undefined) set.lastSeenAt = new Date(patch.lastSeenAt);
    // Role/active-state changes invalidate any access token already issued
    // under the old privileges — bumping this makes getSessionVerified()
    // reject it on the very next request instead of trusting it until expiry.
    if (patch.role !== undefined || patch.isActive !== undefined) {
      set.tokenVersion = sql`${users.tokenVersion} + 1`;
    }
    if (Object.keys(set).length === 0) return this.userById(id);
    const updated = await db.update(users).set(set).where(eq(users.id, id)).returning();
    return updated[0] ? toAuthUser(updated[0]) : null;
  },

  async listUsers(query: ListUsersQuery = {}) {
    const db = getDb();
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    const conds = [];
    if (query.role) conds.push(eq(users.role, query.role));
    if (query.q) conds.push(or(ilike(users.mobile, `%${query.q}%`), ilike(users.name, `%${query.q}%`)));
    const where = conds.length ? and(...conds) : undefined;
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(users)
        .where(where)
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(perPage)
        .offset((page - 1) * perPage),
      db.select({ n: sql<number>`count(*)::int` }).from(users).where(where),
    ]);
    return { users: rows.map((r) => ({ ...toAuthUser(r), isActive: r.isActive })), total: totalRows[0]?.n ?? 0 };
  },

  async saveRefresh(hash, record) {
    const db = getDb();
    await db.insert(refreshTokens).values({ tokenHash: hash, userId: record.userId, expiresAt: record.expiresAt });
  },

  async findRefresh(hash) {
    const db = getDb();
    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
    const rec = rows[0];
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
      return null;
    }
    return { userId: rec.userId, expiresAt: rec.expiresAt };
  },

  async revokeRefresh(hash) {
    await getDb().delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
  },

  async revokeAllForUser(userId) {
    await getDb().delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  },

  async setOtp(mobile, record) {
    const db = getDb();
    const row = {
      codeHash: record.hash,
      expiresAt: record.expiresAt,
      attempts: record.attempts,
      name: record.name ?? null,
      prevHash: record.prevHash ?? null,
      prevExpiresAt: record.prevExpiresAt ?? null,
    };
    await db
      .insert(otpCodes)
      .values({ mobile, ...row })
      .onConflictDoUpdate({ target: otpCodes.mobile, set: row });
  },

  async getOtp(mobile) {
    const rows = await getDb().select().from(otpCodes).where(eq(otpCodes.mobile, mobile)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      hash: r.codeHash,
      expiresAt: r.expiresAt,
      attempts: r.attempts,
      name: r.name ?? undefined,
      prevHash: r.prevHash ?? undefined,
      prevExpiresAt: r.prevExpiresAt ?? undefined,
    };
  },

  async clearOtp(mobile) {
    await getDb().delete(otpCodes).where(eq(otpCodes.mobile, mobile));
  },

  async incrementOtpAttempts(mobile) {
    // Single atomic UPDATE...RETURNING — Postgres serializes concurrent
    // updates to the same row, so two simultaneous verify attempts can never
    // both observe the pre-increment value the way a separate read-then-write
    // (getOtp + setOtp) could. Returning the full row also saves callers a
    // separate getOtp round trip.
    const rows = await getDb()
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.mobile, mobile))
      .returning({
        attempts: otpCodes.attempts,
        hash: otpCodes.codeHash,
        expiresAt: otpCodes.expiresAt,
        name: otpCodes.name,
        prevHash: otpCodes.prevHash,
        prevExpiresAt: otpCodes.prevExpiresAt,
      });
    const row = rows[0];
    if (!row) return null;
    return {
      hash: row.hash,
      expiresAt: row.expiresAt,
      attempts: row.attempts,
      name: row.name ?? undefined,
      prevHash: row.prevHash ?? undefined,
      prevExpiresAt: row.prevExpiresAt ?? undefined,
    };
  },

  async getRate(mobile) {
    const rows = await getDb().select().from(otpRateLimits).where(eq(otpRateLimits.mobile, mobile)).limit(1);
    const r = rows[0];
    if (!r) return { sends: [] };
    return { sends: r.sends, lockedUntil: r.lockedUntil ?? undefined };
  },

  async setRate(mobile, record) {
    await getDb()
      .insert(otpRateLimits)
      .values({ mobile, sends: record.sends, lockedUntil: record.lockedUntil ?? null })
      .onConflictDoUpdate({
        target: otpRateLimits.mobile,
        set: { sends: record.sends, lockedUntil: record.lockedUntil ?? null },
      });
  },

  async clearRate(mobile) {
    await getDb().delete(otpRateLimits).where(eq(otpRateLimits.mobile, mobile));
  },

  async cleanupExpired() {
    const db = getDb();
    const now = Date.now();
    await db.delete(otpCodes).where(lt(otpCodes.expiresAt, now));
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));
    // Rate rows: locked in the past AND no sends within the last hour.
    await db.delete(otpRateLimits).where(
      and(
        or(sql`${otpRateLimits.lockedUntil} IS NULL`, lt(otpRateLimits.lockedUntil, now)),
        sql`NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(${otpRateLimits.sends}) AS s(v)
          WHERE (s.v)::bigint > ${now - 60 * 60 * 1000}
        )`,
      ),
    );
  },
};
