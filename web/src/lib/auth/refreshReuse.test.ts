// @vitest-environment node
/**
 * Refresh-token families + reuse detection (W29, audit area 2), against the
 * REAL Postgres store (in-process pglite) — the memory store cannot prove the
 * property that matters, because its claim is atomic for free (single-threaded
 * JS) while the production path depends on a conditional UPDATE...RETURNING.
 *
 * The cases below exist in a specific order of importance:
 *   1. concurrency FIRST — a false positive here logs out real staff, which is
 *      strictly worse than failing to catch a thief;
 *   2. then the actual detection;
 *   3. then that detect-only (the default) is byte-for-byte the old behaviour.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '@/test/db';
import { requestOtp, verifyOtp, rotateRefresh, logout, AuthError } from './service';
import { findRefresh, saveRefresh } from './store';
import { sha256, requiredSecret } from './crypto';

let close: () => Promise<void>;
let mobileSeq = 0;

const hashOf = (token: string) => sha256(token, requiredSecret(process.env.SESSION_SECRET, 'dev-pepper'));

/** A freshly registered user with a live session. */
async function login() {
  const mobile = `0913600${String(++mobileSeq).padStart(4, '0')}`;
  const { devCode } = await requestOtp(mobile);
  const { user, tokens } = await verifyOtp(mobile, devCode!);
  return { mobile, user, tokens };
}

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});
beforeEach(() => {
  delete process.env.REFRESH_REUSE_DETECTION;
  delete process.env.REFRESH_REUSE_GRACE_SECONDS;
});
afterEach(() => {
  delete process.env.REFRESH_REUSE_DETECTION;
  delete process.env.REFRESH_REUSE_GRACE_SECONDS;
  vi.restoreAllMocks();
});

describe('concurrent refresh must never look like reuse', () => {
  it('two silent-refreshes firing at once with the SAME token both succeed', async () => {
    const { tokens } = await login();

    // The double-fire the audit warned about: two tabs restored together, or a
    // prefetch racing the click. Neither has seen the other's Set-Cookie.
    const [a, b] = await Promise.all([
      rotateRefresh(tokens.refreshToken),
      rotateRefresh(tokens.refreshToken),
    ]);

    expect(a.tokens.refreshToken).not.toBe(b.tokens.refreshToken);
    // Siblings, not strangers: same family, so a later reuse still kills both.
    const [ra, rb] = await Promise.all([
      findRefresh(await hashOf(a.tokens.refreshToken)),
      findRefresh(await hashOf(b.tokens.refreshToken)),
    ]);
    expect(ra?.familyId).toBeTruthy();
    expect(rb?.familyId).toBe(ra?.familyId);
    // And BOTH are usable — whichever cookie the browser kept, the user is in.
    await expect(rotateRefresh(a.tokens.refreshToken)).resolves.toBeTruthy();
    await expect(rotateRefresh(b.tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('ten simultaneous refreshes of one token all succeed and stay one family', async () => {
    const { tokens } = await login();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rotateRefresh(tokens.refreshToken)),
    );
    const families = new Set<string | undefined>();
    for (const r of results) families.add((await findRefresh(await hashOf(r.tokens.refreshToken)))?.familyId);
    expect(families.size).toBe(1);
  });

  it('does NOT revoke the family on a concurrent double-fire, even when enforcing', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    const { tokens } = await login();
    const [a] = await Promise.all([
      rotateRefresh(tokens.refreshToken),
      rotateRefresh(tokens.refreshToken),
    ]);
    // The session survives — this is the exact scenario that would otherwise
    // log a real staff member out and cost an OTP SMS.
    await expect(rotateRefresh(a.tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('a re-presented token is still accepted anywhere inside the grace window', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '120';
    const { tokens } = await login();
    const first = await rotateRefresh(tokens.refreshToken);

    // 90 seconds later — inside a 120s window, so still "the client racing
    // itself", not theft.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_000);
    await expect(rotateRefresh(tokens.refreshToken)).resolves.toBeTruthy();
    vi.restoreAllMocks();

    await expect(rotateRefresh(first.tokens.refreshToken)).resolves.toBeTruthy();
  });
});

describe('reuse detection', () => {
  it('enforce: a token replayed past the grace window kills the whole family', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { tokens } = await login();

    // The thief refreshes first and now holds a self-renewing session…
    const thief = await rotateRefresh(tokens.refreshToken);
    // …and later the victim's browser presents the token it still has.
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);

    // The point of the whole feature: the thief is evicted, not just 401'd.
    await expect(rotateRefresh(thief.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it('enforce: kills descendants several rotations deep, not just the sibling', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { tokens } = await login();
    const r1 = await rotateRefresh(tokens.refreshToken);
    const r2 = await rotateRefresh(r1.tokens.refreshToken);
    const r3 = await rotateRefresh(r2.tokens.refreshToken);

    // Replay the ORIGINAL login token, three rotations back.
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(r3.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it("enforce: one user's reuse never touches another user's session", async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const victim = await login();
    const bystander = await login();

    await rotateRefresh(victim.tokens.refreshToken);
    await expect(rotateRefresh(victim.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);

    await expect(rotateRefresh(bystander.tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('a token that never existed is a plain 401 and revokes nothing', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    const { tokens } = await login();
    // An attacker must not be able to log anyone out by POSTing garbage.
    await expect(rotateRefresh('not-a-real-token')).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('a session predating the family columns (family_id NULL) still rotates', async () => {
    const { user } = await login();
    // Exactly what a row written by the pre-W29 code looks like.
    const legacy = 'legacy-refresh-token-from-before-the-migration';
    await saveRefresh(await hashOf(legacy), {
      userId: user.id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const rotated = await rotateRefresh(legacy);
    expect(rotated.tokens.refreshToken).toBeTruthy();
    // It became the root of its own family, named after its own hash.
    const child = await findRefresh(await hashOf(rotated.tokens.refreshToken));
    expect(child?.familyId).toBe(await hashOf(legacy));
  });

  it('enforce: replaying a legacy (family_id NULL) token still kills its lineage', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'enforce';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { user } = await login();
    const legacy = 'another-legacy-refresh-token';
    await saveRefresh(await hashOf(legacy), {
      userId: user.id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const child = await rotateRefresh(legacy);
    await expect(rotateRefresh(legacy)).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(child.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });
});

describe('detect-only is the default and is externally identical to the old behaviour', () => {
  it('reports the reuse but leaves the family alive', async () => {
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { tokens } = await login();
    const live = await rotateRefresh(tokens.refreshToken);

    // Same 401 the pre-W29 code gave for a rotated-out token…
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    // …and the session it belongs to is untouched. Nobody is logged out by a
    // heuristic that has not yet been observed in production.
    await expect(rotateRefresh(live.tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('off: no revocation and no report', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'off';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { tokens } = await login();
    const live = await rotateRefresh(tokens.refreshToken);
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(live.tokens.refreshToken)).resolves.toBeTruthy();
  });

  it('an unknown REFRESH_REUSE_DETECTION value falls back to detect, never to enforce', async () => {
    process.env.REFRESH_REUSE_DETECTION = 'ENFORCE_MAYBE';
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    const { tokens } = await login();
    const live = await rotateRefresh(tokens.refreshToken);
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(live.tokens.refreshToken)).resolves.toBeTruthy();
  });
});

describe('logout', () => {
  it('revokes the whole family, including a grace-window sibling', async () => {
    const { tokens } = await login();
    const [a, b] = await Promise.all([
      rotateRefresh(tokens.refreshToken),
      rotateRefresh(tokens.refreshToken),
    ]);
    // The user pressed "logout" in the tab holding `a`. The sibling `b` must
    // not survive as a working session the user believes they ended.
    await logout(a.tokens.refreshToken);
    await expect(rotateRefresh(a.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(rotateRefresh(b.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });
});
