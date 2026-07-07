/**
 * Customer club (باشگاه) — membership + tier, auto-advanced by a HYBRID POINTS
 * model (see clubPoints.ts): delivered orders are the spine, with profile
 * completion + identity verification + qualified referrals adding points. All
 * weights/thresholds live in the admin-editable CLUB_CONFIG setting.
 */
import { eq, sql, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { clubMemberships, orders, users } from '@/lib/server/db/schema';
import { getSetting } from './settingsRepo';
import {
  deriveVerificationLevel,
  isProfileComplete,
  qualifiedReferralCount,
} from './verificationRepo';
import {
  DEFAULT_CLUB_CONFIG,
  computePoints,
  nextTierProgress,
  tierForPoints,
  type ClubConfig,
  type ClubTier,
  type PointsBreakdown,
} from './clubPoints';

export type { ClubTier } from './clubPoints';

export interface ClubStatus {
  member: boolean;
  tier?: ClubTier;
  tierName?: string;
  joinedAt?: string;
  points: number;
  breakdown: PointsBreakdown;
  deliveredOrders: number;
  verificationLevel: 1 | 2 | 3;
  profileComplete: boolean;
  qualifiedReferrals: number;
  /** All tiers (name + threshold) so the UI can render the ladder + perks. */
  tiers: ClubConfig['tiers'];
  nextTier?: { tier: ClubTier; tierName: string; needsPoints: number; ratio: number };
}

const clubConfig = () => getSetting<ClubConfig>('CLUB_CONFIG', DEFAULT_CLUB_CONFIG);

export async function joinClub(userId: string): Promise<void> {
  await getDb()
    .insert(clubMemberships)
    .values({ id: ulid(), userId, tier: 'iron' })
    .onConflictDoNothing();
}

export async function setTier(userId: string, tier: ClubTier): Promise<void> {
  await getDb()
    .insert(clubMemberships)
    .values({ id: ulid(), userId, tier })
    .onConflictDoUpdate({ target: clubMemberships.userId, set: { tier } });
}

/** Gather the per-user point inputs (delivered orders, profile, verification,
 *  referrals) — the raw material for computePoints. */
async function pointInputs(userId: string) {
  const db = getDb();
  const [delivered, userRow, referrals] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, 'delivered'), sql`${orders.deletedAt} IS NULL`)),
    db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        idVerifyStatus: users.idVerifyStatus,
        bizVerifyStatus: users.bizVerifyStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    qualifiedReferralCount(userId),
  ]);
  const u = userRow[0];
  return {
    deliveredOrders: delivered[0]?.n ?? 0,
    profileComplete: u ? isProfileComplete(u) : false,
    verificationLevel: u ? deriveVerificationLevel(u) : (1 as const),
    qualifiedReferrals: referrals,
  };
}

export async function clubStatus(userId: string): Promise<ClubStatus> {
  const db = getDb();
  const [membership, config, inputs] = await Promise.all([
    db.select().from(clubMemberships).where(eq(clubMemberships.userId, userId)).limit(1),
    clubConfig(),
    pointInputs(userId),
  ]);
  const m = membership[0];
  const breakdown = computePoints(inputs, config.weights);
  const next = nextTierProgress(breakdown.total, config.tiers);
  return {
    member: Boolean(m),
    tier: m?.tier,
    tierName: m ? config.tiers[m.tier].name : undefined,
    joinedAt: m?.joinedAt.toISOString(),
    points: breakdown.total,
    breakdown,
    deliveredOrders: inputs.deliveredOrders,
    verificationLevel: inputs.verificationLevel,
    profileComplete: inputs.profileComplete,
    qualifiedReferrals: inputs.qualifiedReferrals,
    tiers: config.tiers,
    nextTier: next
      ? { tier: next.tier, tierName: config.tiers[next.tier].name, needsPoints: next.needsPoints, ratio: next.ratio }
      : undefined,
  };
}

/** Deserved tier from the points model — called after any point-affecting
 *  event (order delivered, verification approved, profile completed). Advances
 *  AND retreats. Only members are recomputed (non-members have no tier row). */
export async function recomputeTier(userId: string): Promise<ClubTier | null> {
  const db = getDb();
  const membership = await db
    .select()
    .from(clubMemberships)
    .where(eq(clubMemberships.userId, userId))
    .limit(1);
  const m = membership[0];
  if (!m) return null;
  const [config, inputs] = await Promise.all([clubConfig(), pointInputs(userId)]);
  const points = computePoints(inputs, config.weights).total;
  const deserved = tierForPoints(points, config.tiers);
  if (deserved !== m.tier) await setTier(userId, deserved);
  return deserved;
}

export async function adminListMembers(page = 1, perPage = 50) {
  const db = getDb();
  const [rows, total] = await Promise.all([
    db
      .select({ membership: clubMemberships, mobile: users.mobile, name: users.name })
      .from(clubMemberships)
      .innerJoin(users, eq(clubMemberships.userId, users.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(clubMemberships),
  ]);
  return {
    members: rows.map((r) => ({
      id: r.membership.id,
      userId: r.membership.userId,
      mobile: r.mobile,
      name: r.name ?? undefined,
      tier: r.membership.tier,
      joinedAt: r.membership.joinedAt.toISOString(),
    })),
    total: total[0]?.n ?? 0,
  };
}
