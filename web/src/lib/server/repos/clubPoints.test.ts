/** Pure-function units for the hybrid club-points model. */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLUB_CONFIG,
  computePoints,
  tierForPoints,
  nextTierProgress,
  verificationPoints,
} from './clubPoints';

const W = DEFAULT_CLUB_CONFIG.weights;
const T = DEFAULT_CLUB_CONFIG.tiers;

describe('computePoints', () => {
  it('delivered orders are the spine', () => {
    const b = computePoints(
      { deliveredOrders: 4, profileComplete: false, verificationLevel: 1, qualifiedReferrals: 0 },
      W,
    );
    expect(b.fromOrders).toBe(4 * W.order);
    expect(b.total).toBe(4 * W.order);
  });

  it('profile + verification + referrals add on top (reinforcing systems)', () => {
    const b = computePoints(
      { deliveredOrders: 2, profileComplete: true, verificationLevel: 3, qualifiedReferrals: 2 },
      W,
    );
    expect(b.fromProfile).toBe(W.profile);
    expect(b.fromVerification).toBe(W.level3);
    expect(b.fromReferrals).toBe(2 * W.referral);
    expect(b.total).toBe(2 * W.order + W.profile + W.level3 + 2 * W.referral);
  });

  it('verificationPoints escalates and L3 replaces L2 (not additive)', () => {
    expect(verificationPoints(1, W)).toBe(0);
    expect(verificationPoints(2, W)).toBe(W.level2);
    expect(verificationPoints(3, W)).toBe(W.level3);
  });

  it('clamps negative inputs to zero', () => {
    const b = computePoints(
      { deliveredOrders: -5, profileComplete: false, verificationLevel: 1, qualifiedReferrals: -3 },
      W,
    );
    expect(b.total).toBe(0);
  });
});

describe('tierForPoints (defaults iron=0, steel=5, poolad=15)', () => {
  it('maps points to the highest cleared tier', () => {
    expect(tierForPoints(0, T)).toBe('iron');
    expect(tierForPoints(4, T)).toBe('iron');
    expect(tierForPoints(5, T)).toBe('steel');
    expect(tierForPoints(14, T)).toBe('steel');
    expect(tierForPoints(15, T)).toBe('poolad');
    expect(tierForPoints(999, T)).toBe('poolad');
  });
});

describe('nextTierProgress (goal-gradient bar)', () => {
  it('reports the next tier, points remaining, and 0..1 ratio', () => {
    const p = nextTierProgress(3, T)!; // iron floor 0, steel floor 5
    expect(p.tier).toBe('steel');
    expect(p.needsPoints).toBe(2);
    expect(p.ratio).toBeCloseTo(3 / 5, 5);
  });

  it('ratio is bounded within the current band', () => {
    // 10 points: between steel(5) and poolad(15) → ratio (10-5)/(15-5)=0.5
    const p = nextTierProgress(10, T)!;
    expect(p.tier).toBe('poolad');
    expect(p.ratio).toBeCloseTo(0.5, 5);
    expect(p.needsPoints).toBe(5);
  });

  it('null at the top tier', () => {
    expect(nextTierProgress(20, T)).toBeNull();
  });
});
