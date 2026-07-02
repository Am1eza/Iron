/** Customer club (باشگاه) — membership + tier, auto-advanced by won leads. */
import { eq, sql, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { clubMemberships, leads } from '@/lib/server/db/schema';
import { getSetting } from './settingsRepo';

export type ClubTier = 'iron' | 'steel' | 'poolad';

export interface ClubStatus {
  member: boolean;
  tier?: ClubTier;
  joinedAt?: string;
  wonLeads: number;
  nextTier?: { tier: ClubTier; needsLeads: number };
}

type TierConfig = Record<ClubTier, { name: string; minLeads: number }>;

const DEFAULT_TIERS: TierConfig = {
  iron: { name: 'آهنی', minLeads: 0 },
  steel: { name: 'فولادی', minLeads: 3 },
  poolad: { name: 'پولادی', minLeads: 10 },
};

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

export async function clubStatus(userId: string): Promise<ClubStatus> {
  const db = getDb();
  const [membership, won, tiers] = await Promise.all([
    db.select().from(clubMemberships).where(eq(clubMemberships.userId, userId)).limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.userId, userId), eq(leads.status, 'won'))),
    getSetting<TierConfig>('CLUB_TIERS', DEFAULT_TIERS),
  ]);
  const wonLeads = won[0]?.n ?? 0;
  const m = membership[0];
  const order: ClubTier[] = ['iron', 'steel', 'poolad'];
  const next = m
    ? order.slice(order.indexOf(m.tier) + 1).find((t) => tiers[t].minLeads > wonLeads)
    : undefined;
  return {
    member: Boolean(m),
    tier: m?.tier,
    joinedAt: m?.joinedAt.toISOString(),
    wonLeads,
    nextTier: next ? { tier: next, needsLeads: Math.max(0, tiers[next].minLeads - wonLeads) } : undefined,
  };
}

/** Deserved tier from won leads (used when a lead is marked won). */
export async function recomputeTier(userId: string): Promise<ClubTier | null> {
  const status = await clubStatus(userId);
  if (!status.member) return null;
  const tiers = await getSetting<TierConfig>('CLUB_TIERS', DEFAULT_TIERS);
  const deserved: ClubTier =
    status.wonLeads >= tiers.poolad.minLeads ? 'poolad' : status.wonLeads >= tiers.steel.minLeads ? 'steel' : 'iron';
  if (deserved !== status.tier) await setTier(userId, deserved);
  return deserved;
}

export async function adminListMembers(page = 1, perPage = 50) {
  const db = getDb();
  const { users } = await import('@/lib/server/db/schema');
  const rows = await db
    .select({ membership: clubMemberships, mobile: users.mobile, name: users.name })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(clubMemberships);
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
