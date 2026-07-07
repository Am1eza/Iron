/**
 * Customer-club scoring — the hybrid points model (owner's chosen design).
 *
 * Delivered orders are the SPINE (real purchases); profile completion and
 * identity verification add points so leveling-up and verifying reinforce each
 * other (goal-gradient + endowed-progress psychology). All weights/thresholds
 * are data (admin-editable via the CLUB_CONFIG setting) so the business can
 * tune the ladder without a deploy.
 *
 * Pure + unit-tested; no DB. clubRepo gathers the per-user inputs and applies
 * these functions.
 */
export type ClubTier = 'iron' | 'steel' | 'poolad';
export const CLUB_ORDER: ClubTier[] = ['iron', 'steel', 'poolad'];

export interface ClubWeights {
  order: number; // points per delivered order (the spine)
  profile: number; // one-time bonus for a completed name
  level2: number; // approved personal identity (کد ملی)
  level3: number; // approved business (KYB) — replaces level2, not additive
  referral: number; // per qualified referral (referee reached ≥ level 2)
}

export interface ClubTierDef {
  name: string;
  minPoints: number;
}

export interface ClubConfig {
  weights: ClubWeights;
  tiers: Record<ClubTier, ClubTierDef>;
}

/** Sensible defaults. Order=1 keeps the ladder legible ("N orders ≈ N points"),
 *  verification gives a real head-start toward the next tier. */
export const DEFAULT_CLUB_CONFIG: ClubConfig = {
  weights: { order: 1, profile: 1, level2: 2, level3: 3, referral: 1 },
  tiers: {
    iron: { name: 'آهنی', minPoints: 0 },
    steel: { name: 'فولادی', minPoints: 5 },
    poolad: { name: 'پولادی', minPoints: 15 },
  },
};

export interface PointsInput {
  deliveredOrders: number;
  profileComplete: boolean;
  verificationLevel: 1 | 2 | 3;
  qualifiedReferrals: number;
}

export interface PointsBreakdown {
  total: number;
  fromOrders: number;
  fromProfile: number;
  fromVerification: number;
  fromReferrals: number;
}

export function verificationPoints(level: 1 | 2 | 3, w: ClubWeights): number {
  return level === 3 ? w.level3 : level === 2 ? w.level2 : 0;
}

/** The full points breakdown (so the UI can explain "where your points come from"). */
export function computePoints(input: PointsInput, w: ClubWeights): PointsBreakdown {
  const fromOrders = Math.max(0, input.deliveredOrders) * w.order;
  const fromProfile = input.profileComplete ? w.profile : 0;
  const fromVerification = verificationPoints(input.verificationLevel, w);
  const fromReferrals = Math.max(0, input.qualifiedReferrals) * w.referral;
  return {
    total: fromOrders + fromProfile + fromVerification + fromReferrals,
    fromOrders,
    fromProfile,
    fromVerification,
    fromReferrals,
  };
}

/** Highest tier whose minPoints the score clears. */
export function tierForPoints(points: number, tiers: ClubConfig['tiers']): ClubTier {
  let earned: ClubTier = 'iron';
  for (const t of CLUB_ORDER) {
    if (points >= tiers[t].minPoints) earned = t;
  }
  return earned;
}

export interface NextTierProgress {
  tier: ClubTier;
  needsPoints: number; // points still required to reach it
  /** 0..1 progress from the CURRENT tier's floor to the next tier's floor —
   *  for the goal-gradient progress bar. */
  ratio: number;
}

/** Progress toward the next tier above `points`, or null at the top tier. */
export function nextTierProgress(points: number, tiers: ClubConfig['tiers']): NextTierProgress | null {
  const current = tierForPoints(points, tiers);
  const idx = CLUB_ORDER.indexOf(current);
  const next = CLUB_ORDER[idx + 1];
  if (!next) return null;
  const floor = tiers[current].minPoints;
  const ceil = tiers[next].minPoints;
  const span = Math.max(1, ceil - floor);
  const ratio = Math.min(1, Math.max(0, (points - floor) / span));
  return { tier: next, needsPoints: Math.max(0, ceil - points), ratio };
}
