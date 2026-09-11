// @vitest-environment node
/**
 * revokeSessionsForUser (US-21.3 admin "revoke sessions" action) against the
 * Postgres store — distinct from revokeAllForUser: this must ALSO bump
 * tokenVersion so an already-issued access token dies immediately, not just
 * future refresh attempts. See store.types.ts's doc comment on the method.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { refreshTokens } from '@/lib/server/db/schema';
import {
  createUser,
  saveRefresh,
  findRefresh,
  userById,
  revokeSessionsForUser,
  rotateRefreshAtomic,
} from './store';

/** Distinct family count for a user, the same grouping `saveRefresh`'s cap
 *  logic uses (`familyId ?? tokenHash`) — a fresh, direct read so these
 *  assertions don't depend on any store helper that might itself be wrong. */
async function familyCount(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ tokenHash: refreshTokens.tokenHash, familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId));
  return new Set(rows.map((r) => r.familyId ?? r.tokenHash)).size;
}

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe('revokeSessionsForUser', () => {
  it('clears refresh tokens AND bumps tokenVersion in one call', async () => {
    const user = await createUser({ mobile: '09135000099', name: 'کاربر آزمایشی' });
    expect(user.tokenVersion).toBe(0);

    await saveRefresh('test-hash-1', { userId: user.id, expiresAt: Date.now() + 60_000 });
    expect(await findRefresh('test-hash-1')).not.toBeNull();

    await revokeSessionsForUser(user.id);

    expect(await findRefresh('test-hash-1')).toBeNull();
    const after = await userById(user.id);
    expect(after?.tokenVersion).toBe(1);
  });

  it('bumps tokenVersion again on a second call (idempotent-safe, not idempotent-value)', async () => {
    const user = await createUser({ mobile: '09135000098' });
    await revokeSessionsForUser(user.id);
    await revokeSessionsForUser(user.id);
    const after = await userById(user.id);
    expect(after?.tokenVersion).toBe(2);
  });
});

describe('active session family cap', () => {
  it('keeps at most five login families and evicts the oldest atomically', async () => {
    const user = await createUser({ mobile: '09135000097' });
    const base = Date.now() + 60_000;
    for (let i = 1; i <= 6; i++) {
      await saveRefresh(`family-${i}`, {
        userId: user.id,
        expiresAt: base + i,
        familyId: `family-${i}`,
      });
    }
    expect(await findRefresh('family-1')).toBeNull();
    for (let i = 2; i <= 6; i++) expect(await findRefresh(`family-${i}`)).not.toBeNull();
  });

  // F-146 acceptance criterion: "چندتب یک دستگاه N دستگاه حساب نشود" — a
  // rotation (silent refresh, multi-tab grace re-issue) must never look like
  // a new login to the family cap. This is true STRUCTURALLY, not just by
  // coincidence: rotateRefreshAtomic inserts the child directly, and never
  // calls saveRefresh (the only place the cap/eviction logic lives) — see
  // store.pg.ts. This test proves the observable consequence of that.
  it('a rotation (multi-tab/grace re-issue) never creates a new family or triggers eviction', async () => {
    const user = await createUser({ mobile: '09135000096' });
    const base = Date.now() + 60_000;
    for (let i = 1; i <= 5; i++) {
      await saveRefresh(`mt-family-${i}`, { userId: user.id, expiresAt: base + i, familyId: `mt-family-${i}` });
    }
    expect(await familyCount(user.id)).toBe(5);

    // Rotate the root of family 3 (a plain single-use rotation, same as an
    // ordinary silent refresh) — nothing about this path is a "login".
    // ttlMs is deliberately huge — rotateRefreshAtomic clamps the child's
    // expiry to min(now+ttlMs, parent.expiresAt), so with a near-term parent
    // (set above) this exercises the same "child inherits parent's expiry"
    // path the old (pre-F-145) explicit-expiresAt call used to.
    const rotated = await rotateRefreshAtomic(
      'mt-family-3',
      'mt-family-3-child',
      30 * 24 * 60 * 60 * 1000,
      60_000, // grace window
      false,
    );
    expect(rotated.status).toBe('claimed');

    // Still exactly 5 families — the rotation must not have looked like a
    // 6th login and evicted the actual oldest one (mt-family-1).
    expect(await familyCount(user.id)).toBe(5);
    expect(await findRefresh('mt-family-1')).not.toBeNull();
    // The child lives in the SAME family as its parent, not a new one.
    const child = await findRefresh('mt-family-3-child');
    expect(child?.familyId).toBe('mt-family-3');

    // A second presentation of the SAME already-rotated parent inside the
    // grace window (the actual "two browser tabs" case) mints a sibling —
    // still the same family, still no eviction.
    const grace = await rotateRefreshAtomic(
      'mt-family-3',
      'mt-family-3-sibling',
      30 * 24 * 60 * 60 * 1000,
      60_000,
      false,
    );
    expect(grace.status).toBe('grace');
    expect(await familyCount(user.id)).toBe(5);

    // A GENUINE new login, by contrast, still enforces the cap as normal —
    // proving the rotation path above didn't accidentally disable it.
    await saveRefresh('mt-family-6', { userId: user.id, expiresAt: base + 2000, familyId: 'mt-family-6' });
    expect(await familyCount(user.id)).toBe(5);
    expect(await findRefresh('mt-family-1')).toBeNull(); // now genuinely evicted
  });
});
