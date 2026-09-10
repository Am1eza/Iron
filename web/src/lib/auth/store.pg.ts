/**
 * Postgres auth store — Drizzle against users/refresh_tokens/otp_codes/
 * otp_rate_limits. Same contract as the memory store; sessions and accounts
 * survive restarts and scale across instances.
 */
import { and, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { users, refreshTokens, otpCodes, otpRateLimits, clubMemberships } from '@/lib/server/db/schema';
import { likeContainsDigitVariants } from '@/lib/server/utils/likeEscape';
import { randomInviteCode } from './crypto';
import type { AuthUser } from './types';
import type { AuthStore, CreateUserInput, ListUsersQuery, UserPatch } from './store.types';

type UserRow = typeof users.$inferSelect;
const MAX_SESSION_FAMILIES = 5;

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

async function userWhere(cond: ReturnType<typeof eq>, tx?: DbOrTx): Promise<AuthUser | null> {
  const db = tx ?? getDb();
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
  userByMobile(mobile: string, tx?: DbOrTx) {
    return userWhere(eq(users.mobile, mobile), tx);
  },

  userById(id: string, tx?: DbOrTx) {
    return userWhere(eq(users.id, id), tx);
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

  async updateUser(id: string, patch: UserPatch, tx?: DbOrTx) {
    const db = tx ?? getDb();
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
    if (patch.role !== undefined || patch.isActive !== undefined) {
      // A caller-supplied `tx` already provides atomicity (and a caller that
      // opened one is typically already holding — or about to take — its own
      // lock on this row, e.g. the admin allowlist's last-admin count read;
      // opening ANOTHER nested transaction here would just be redundant, not
      // safer). Only self-manage a transaction when nobody handed us one.
      const run = async (t: DbOrTx) => {
        await t.select({ id: users.id }).from(users).where(eq(users.id, id)).for('update');
        await t.delete(refreshTokens).where(eq(refreshTokens.userId, id));
        const updated = await t.update(users).set(set).where(eq(users.id, id)).returning();
        return updated[0] ? toAuthUser(updated[0]) : null;
      };
      return tx ? run(tx) : getDb().transaction(run);
    }
    const updated = await db.update(users).set(set).where(eq(users.id, id)).returning();
    return updated[0] ? toAuthUser(updated[0]) : null;
  },

  async listUsers(query: ListUsersQuery = {}) {
    const db = getDb();
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    const conds = [];
    if (query.role) conds.push(eq(users.role, query.role));
    if (query.q) {
      // `users.mobile` is stored Latin-only, so «۰۹۱۲…» typed on a Persian
      // layout in the panel's «جستجو: موبایل یا نام…» box matched nothing.
      // Both spellings are searched; the helper also escapes LIKE
      // metacharacters, which this call site was missing.
      const terms = likeContainsDigitVariants(query.q);
      conds.push(or(...terms.flatMap((q) => [ilike(users.mobile, q), ilike(users.name, q)])));
    }
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
    await db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, record.userId)).for('update');
      if (!record.parentHash) {
        const rows = await tx.select({
          tokenHash: refreshTokens.tokenHash,
          familyId: refreshTokens.familyId,
          expiresAt: refreshTokens.expiresAt,
        }).from(refreshTokens).where(and(
          eq(refreshTokens.userId, record.userId),
          sql`${refreshTokens.expiresAt} > ${Date.now()}`,
        ));
        const families = new Map<string, number>();
        for (const row of rows) {
          const family = row.familyId ?? row.tokenHash;
          families.set(family, Math.min(families.get(family) ?? Infinity, row.expiresAt));
        }
        if (families.size >= MAX_SESSION_FAMILIES) {
          const oldest = [...families].sort((a, b) => a[1] - b[1])[0]?.[0];
          if (oldest) await tx.delete(refreshTokens).where(or(
            eq(refreshTokens.familyId, oldest), eq(refreshTokens.tokenHash, oldest),
          ));
        }
      }
      await tx.insert(refreshTokens).values({
        tokenHash: hash,
        userId: record.userId,
        expiresAt: record.expiresAt,
        familyId: record.familyId ?? null,
        parentHash: record.parentHash ?? null,
      });
    });
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
    // Deliberately NOT filtered on rotatedAt — a spent row is exactly what the
    // caller needs to see to tell reuse apart from a token that never existed.
    return {
      userId: rec.userId,
      expiresAt: rec.expiresAt,
      familyId: rec.familyId ?? undefined,
      parentHash: rec.parentHash ?? undefined,
      rotatedAt: rec.rotatedAt ?? undefined,
    };
  },

  async claimRefresh(hash, rotatedAt) {
    // One conditional UPDATE...RETURNING. Postgres serializes concurrent
    // updates of the same row, so of two simultaneous rotations of the same
    // token exactly one gets a row back; the loser gets zero rows and falls
    // into the grace-window branch instead of being mistaken for a rotation.
    const rows = await getDb()
      .update(refreshTokens)
      .set({ rotatedAt })
      .where(
        and(
          eq(refreshTokens.tokenHash, hash),
          sql`${refreshTokens.rotatedAt} IS NULL`,
          sql`${refreshTokens.expiresAt} > ${rotatedAt}`,
        ),
      )
      .returning();
    const rec = rows[0];
    if (!rec) return null;
    return {
      userId: rec.userId,
      expiresAt: rec.expiresAt,
      familyId: rec.familyId ?? undefined,
      parentHash: rec.parentHash ?? undefined,
      rotatedAt: rec.rotatedAt ?? undefined,
    };
  },
  async rotateRefreshAtomic(parentHash, childHash, child, now, graceMs, enforceReuse) {
    return getDb().transaction(async tx=>{
      const [hint]=await tx.select({userId:refreshTokens.userId}).from(refreshTokens).where(eq(refreshTokens.tokenHash,parentHash));
      if(!hint)return {status:'invalid'} as const;
      await tx.select({id:users.id}).from(users).where(eq(users.id,hint.userId)).for('update');
      const [parent]=await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash,parentHash)).for('update');
      if(!parent||parent.expiresAt<=now)return {status:'invalid'} as const;
      const family=parent.familyId??parentHash;
      const record={userId:parent.userId,expiresAt:parent.expiresAt,familyId:parent.familyId??undefined,parentHash:parent.parentHash??undefined,rotatedAt:parent.rotatedAt??undefined};
      if(parent.rotatedAt===null){
        await tx.update(refreshTokens).set({rotatedAt:now}).where(eq(refreshTokens.tokenHash,parentHash));
        await tx.insert(refreshTokens).values({tokenHash:childHash,userId:parent.userId,expiresAt:Math.min(child.expiresAt,parent.expiresAt),familyId:family,parentHash});
        return {status:'claimed',record} as const;
      }
      const age=now-parent.rotatedAt;
      if(age>=0&&age<=graceMs){
        await tx.insert(refreshTokens).values({tokenHash:childHash,userId:parent.userId,expiresAt:Math.min(child.expiresAt,parent.expiresAt),familyId:family,parentHash});
        return {status:'grace',record} as const;
      }
      if(enforceReuse)await tx.delete(refreshTokens).where(or(eq(refreshTokens.familyId,family),eq(refreshTokens.tokenHash,family)));
      return {status:'reuse',record} as const;
    });
  },

  async revokeRefresh(hash) {
    await getDb().delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
  },

  async revokeFamily(familyId) {
    // `tokenHash` is matched too: a session that predates the family columns
    // has family_id NULL, and rotateRefresh names such a lineage after the
    // token's own hash — without this the pre-migration root would survive
    // the very revocation it triggered.
    await getDb().transaction(async tx=>{
      const [hint]=await tx.select({userId:refreshTokens.userId}).from(refreshTokens)
        .where(or(eq(refreshTokens.familyId,familyId),eq(refreshTokens.tokenHash,familyId))).limit(1);
      if(!hint)return;
      await tx.select({id:users.id}).from(users).where(eq(users.id,hint.userId)).for('update');
      await tx.delete(refreshTokens).where(or(eq(refreshTokens.familyId, familyId), eq(refreshTokens.tokenHash, familyId)));
    });
  },

  async revokeAllForUser(userId) {
    await getDb().delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  },

  async revokeSessionsForUser(userId) {
    await getDb().transaction(async tx=>{
      await tx.select({id:users.id}).from(users).where(eq(users.id,userId)).for('update');
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await tx.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, userId));
    });
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
  async consumeOtp(mobile, hash, expiresAt) {
    const rows = await getDb().delete(otpCodes).where(and(
      eq(otpCodes.mobile, mobile), eq(otpCodes.codeHash, hash),
      eq(otpCodes.expiresAt, expiresAt), sql`${otpCodes.expiresAt} > ${Date.now()}`,
    )).returning({ mobile: otpCodes.mobile });
    return rows.length === 1;
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
  async claimOtpSend(mobile, now, cooldownMs, windowMs, maxSends, combinedKey) {
    return getDb().transaction(async tx => {
      const keys=[mobile,...(combinedKey?[combinedKey]:[])].sort();
      for(const key of keys)await tx.insert(otpRateLimits).values({mobile:key,sends:[]}).onConflictDoNothing();
      const rows=[];for(const key of keys){const [row]=await tx.select().from(otpRateLimits).where(eq(otpRateLimits.mobile,key)).for('update');rows.push(row!);}
      for(const current of rows){const sends=current.sends.filter(t=>now-t<windowMs),last=sends.at(-1);
        if(current.lockedUntil&&current.lockedUntil>now)return {ok:false,reason:'locked',retryAfter:Math.ceil((current.lockedUntil-now)/1000)} as const;
        if(last&&now-last<cooldownMs)return {ok:false,reason:'cooldown',retryAfter:Math.ceil((cooldownMs-(now-last))/1000)} as const;
        if(sends.length>=maxSends)return {ok:false,reason:'too_many',retryAfter:Math.ceil(windowMs/1000)} as const;}
      for(const current of rows)await tx.update(otpRateLimits).set({sends:[...current.sends.filter(t=>now-t<windowMs),now]}).where(eq(otpRateLimits.mobile,current.mobile));
      return {ok:true} as const;
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
