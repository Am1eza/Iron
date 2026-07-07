/**
 * Progressive identity verification (KYC/KYB) — level derivation, Iranian ID
 * validation, the per-level "what it unlocks" map, and the self-attest →
 * admin-review flow. Level 1 = phone/OTP (always); Level 2 = personal (کد ملی);
 * Level 3 = business (شناسه ملی + کد اقتصادی). Verification is self-attested and
 * approved by an admin — no external registry API (that can slot in later at
 * the `submit*` boundary without changing callers).
 *
 * The pure functions (validators, level derivation, unlock map) are exported
 * and unit-tested; nothing here throws to the request path.
 */
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { users, clubMemberships } from '@/lib/server/db/schema';
import { randomInviteCode } from '@/lib/auth/crypto';
import { LEVEL_INFO, type LevelInfo } from '@/lib/data/verification';
import type { UserProfile, VerificationLevel, VerifyStatus } from '@/lib/auth/types';

export { LEVEL_INFO, type LevelInfo };

/* --------------------------- pure: validation --------------------------- */

const digits = (s: string) => s.replace(/[^\d۰-۹٠-٩]/g, '');
/** Normalize Persian/Arabic digits → Latin (mirrors format.normalizeDigits,
 *  duplicated tiny to keep this repo importable without the format util). */
function toLatin(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Iranian national ID (کد ملی) — 10 digits with the official check-digit
 * algorithm. Rejects all-same-digit sequences (0000000000 … which pass the
 * raw checksum but are invalid).
 */
export function isValidNationalId(raw: string): boolean {
  const code = toLatin(digits(raw));
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

/** شناسه ملی (legal-entity national ID) — 11 digits. Format check only
 *  (the full check-digit algorithm exists but admin review is the gate). */
export function isValidCompanyNationalId(raw: string): boolean {
  return /^\d{11}$/.test(toLatin(digits(raw)));
}

/** کد اقتصادی (economic/tax code) — historically 12 digits. Format check only. */
export function isValidEconomicCode(raw: string): boolean {
  return /^\d{12}$/.test(toLatin(digits(raw)));
}

/* ----------------------- pure: level + unlocks ----------------------- */

/** The verification level a user has EARNED from their two approval statuses.
 *  Business (L3) implies personal identity, so an approved business tops out. */
export function deriveVerificationLevel(input: {
  idVerifyStatus: VerifyStatus;
  bizVerifyStatus: VerifyStatus;
}): VerificationLevel {
  if (input.bizVerifyStatus === 'approved') return 3;
  if (input.idVerifyStatus === 'approved') return 2;
  return 1;
}

/* ------------------------------- DB reads ------------------------------- */

type Row = typeof users.$inferSelect;

function toProfile(row: Row, tier?: 'iron' | 'steel' | 'poolad' | null): UserProfile {
  return {
    id: row.id,
    mobile: row.mobile,
    name: row.name ?? undefined,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    role: row.role,
    clubTier: tier ?? undefined,
    createdAt: row.createdAt.toISOString(),
    tokenVersion: row.tokenVersion,
    nationalId: row.nationalId ?? undefined,
    idVerifyStatus: row.idVerifyStatus,
    companyName: row.companyName ?? undefined,
    companyNationalId: row.companyNationalId ?? undefined,
    economicCode: row.economicCode ?? undefined,
    bizVerifyStatus: row.bizVerifyStatus,
    verificationLevel: deriveVerificationLevel(row),
    inviteCode: row.inviteCode ?? undefined,
    referredBy: row.referredBy ?? undefined,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const rows = await getDb()
    .select({ user: users, tier: clubMemberships.tier })
    .from(users)
    .leftJoin(clubMemberships, eq(clubMemberships.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Backfill an invite code for accounts created before the referral feature
  // (or the memory store, which doesn't set one). Idempotent; collisions on a
  // 32^7 space are astronomically unlikely — a rare unique-violation just
  // leaves the code null this pass and retries next time.
  let user = row.user;
  if (!user.inviteCode) {
    try {
      const code = randomInviteCode();
      const updated = await getDb()
        .update(users)
        .set({ inviteCode: code })
        .where(eq(users.id, userId))
        .returning();
      if (updated[0]) user = updated[0];
    } catch {
      /* keep going with a null code */
    }
  }
  return toProfile(user, row.tier);
}

/** True when the profile has the fields that count toward the "profile
 *  complete" club bonus — first + last name present. Accepts raw DB nulls. */
export function isProfileComplete(p: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return Boolean(p.firstName?.trim() && p.lastName?.trim());
}

/* ------------------------------ DB writes ------------------------------ */

/** Resolve a referrer's invite code → their user id (null if unknown or self). */
export async function resolveReferrer(inviteCode: string, selfMobile: string): Promise<string | null> {
  const code = inviteCode.trim().toUpperCase();
  if (!code) return null;
  const rows = await getDb()
    .select({ id: users.id, mobile: users.mobile })
    .from(users)
    .where(eq(users.inviteCode, code))
    .limit(1);
  const r = rows[0];
  if (!r || r.mobile === selfMobile) return null; // no self-referral
  return r.id;
}

/** Level-2 submission: store کد ملی and flag pending for admin review. */
export async function submitLevel2(
  userId: string,
  input: { nationalId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidNationalId(input.nationalId)) return { ok: false, error: 'کد ملی معتبر نیست.' };
  await getDb()
    .update(users)
    .set({ nationalId: toLatin(digits(input.nationalId)), idVerifyStatus: 'pending' })
    .where(eq(users.id, userId));
  return { ok: true };
}

/** Level-3 submission: store business identifiers and flag pending. */
export async function submitLevel3(
  userId: string,
  input: { companyName: string; companyNationalId: string; economicCode: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.companyName.trim()) return { ok: false, error: 'نام شرکت لازم است.' };
  if (!isValidCompanyNationalId(input.companyNationalId)) return { ok: false, error: 'شناسهٔ ملی شرکت معتبر نیست.' };
  if (!isValidEconomicCode(input.economicCode)) return { ok: false, error: 'کد اقتصادی معتبر نیست.' };
  await getDb()
    .update(users)
    .set({
      companyName: input.companyName.trim(),
      companyNationalId: toLatin(digits(input.companyNationalId)),
      economicCode: toLatin(digits(input.economicCode)),
      bizVerifyStatus: 'pending',
    })
    .where(eq(users.id, userId));
  return { ok: true };
}

export type VerifyKind = 'id' | 'biz';

/** Admin decision on a pending submission. Returns the affected user id so the
 *  caller can recompute the club tier + audit. */
export async function reviewVerification(
  userId: string,
  kind: VerifyKind,
  decision: 'approved' | 'rejected',
): Promise<UserProfile | null> {
  const col = kind === 'id' ? { idVerifyStatus: decision } : { bizVerifyStatus: decision };
  await getDb().update(users).set(col).where(eq(users.id, userId));
  return getUserProfile(userId);
}

export interface PendingVerification {
  userId: string;
  mobile: string;
  name?: string;
  kind: VerifyKind;
  nationalId?: string;
  companyName?: string;
  companyNationalId?: string;
  economicCode?: string;
}

/** All submissions awaiting admin review (level 2 and level 3), newest first. */
export async function listPendingVerifications(): Promise<PendingVerification[]> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(or(eq(users.idVerifyStatus, 'pending'), eq(users.bizVerifyStatus, 'pending')))
    .orderBy(users.createdAt);
  const out: PendingVerification[] = [];
  for (const r of rows) {
    if (r.idVerifyStatus === 'pending') {
      out.push({ userId: r.id, mobile: r.mobile, name: r.name ?? undefined, kind: 'id', nationalId: r.nationalId ?? undefined });
    }
    if (r.bizVerifyStatus === 'pending') {
      out.push({
        userId: r.id,
        mobile: r.mobile,
        name: r.name ?? undefined,
        kind: 'biz',
        companyName: r.companyName ?? undefined,
        companyNationalId: r.companyNationalId ?? undefined,
        economicCode: r.economicCode ?? undefined,
      });
    }
  }
  return out;
}

/** Count qualified referrals for a user (referees who reached ≥ level 2). Used
 *  by the club points formula. */
export async function qualifiedReferralCount(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: users.id, idStatus: users.idVerifyStatus, bizStatus: users.bizVerifyStatus })
    .from(users)
    .where(and(eq(users.referredBy, userId), isNotNull(users.id)));
  return rows.filter((r) => r.idStatus === 'approved' || r.bizStatus === 'approved').length;
}
