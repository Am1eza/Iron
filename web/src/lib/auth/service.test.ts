// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { requestOtp, verifyOtp, rotateRefresh, logout, AuthError } from './service';
import { setRate } from './store';
import { verifyAccessToken } from './jwt';

const wrongCode = (code: string) =>
  String((Number(code) + 1) % 100000).padStart(5, '0');

describe('OTP auth flow', () => {
  it('registers a new user on first verified OTP and issues a valid JWT', async () => {
    const mobile = '09131000001';
    const { devCode, ttl } = await requestOtp(mobile, 'علی');
    expect(ttl).toBeGreaterThan(0);
    expect(devCode).toBeTruthy();

    const { user, tokens, isNew } = await verifyOtp(mobile, devCode!);
    expect(isNew).toBe(true);
    expect(user.mobile).toBe(mobile);
    expect(user.name).toBe('علی');
    expect(user.role).toBe('customer');

    const claims = await verifyAccessToken(tokens.accessToken);
    expect(claims?.sub).toBe(user.id);
    expect(claims?.role).toBe('customer');
  });

  it('logs an existing user in (not new) on subsequent OTP — no cooldown after success', async () => {
    const mobile = '09131000002';
    const first = await requestOtp(mobile);
    await verifyOtp(mobile, first.devCode!);

    // Successful verification clears the resend cooldown: re-login works immediately.
    const second = await requestOtp(mobile);
    const { isNew } = await verifyOtp(mobile, second.devCode!);
    expect(isNew).toBe(false);
  });

  it('rejects a wrong code', async () => {
    const mobile = '09131000003';
    const { devCode } = await requestOtp(mobile);
    await expect(verifyOtp(mobile, wrongCode(devCode!))).rejects.toBeInstanceOf(AuthError);
  });

  it('enforces a resend cooldown', async () => {
    const mobile = '09131000004';
    await requestOtp(mobile);
    await expect(requestOtp(mobile)).rejects.toBeInstanceOf(AuthError);
  });

  it('a resend keeps the PREVIOUS unexpired code valid (slow-operator SMS delivery)', async () => {
    const mobile = '09131000014';
    const { devCode: codeA } = await requestOtp(mobile);
    // Skip past the resend cooldown without waiting.
    await setRate(mobile, { sends: [Date.now() - 61_000] });
    const { devCode: codeB } = await requestOtp(mobile);
    expect(codeB).not.toBe(codeA);

    // The FIRST code — the SMS that arrives minutes late — still logs in.
    const { user } = await verifyOtp(mobile, codeA!);
    expect(user.mobile).toBe(mobile);
    // Single-use: after success neither code works again.
    await expect(verifyOtp(mobile, codeB!)).rejects.toBeInstanceOf(AuthError);
  });

  it('a resend does NOT reset the shared attempt counter (no brute-force via resend)', async () => {
    const mobile = '09131000015';
    const { devCode } = await requestOtp(mobile);
    for (let i = 0; i < 3; i++) {
      await expect(verifyOtp(mobile, wrongCode(devCode!))).rejects.toBeInstanceOf(AuthError);
    }
    await setRate(mobile, { sends: [Date.now() - 61_000] });
    const { devCode: codeB } = await requestOtp(mobile);
    // 3 attempts already burned + these 2 push past the 5-attempt cap.
    await expect(verifyOtp(mobile, wrongCode(codeB!))).rejects.toBeInstanceOf(AuthError);
    await expect(verifyOtp(mobile, wrongCode(codeB!))).rejects.toBeInstanceOf(AuthError);
    // Record now cleared + number locked — even the RIGHT code is rejected.
    await expect(verifyOtp(mobile, codeB!)).rejects.toBeInstanceOf(AuthError);
  });

  it('rotates the refresh token (old token becomes invalid once past the grace window)', async () => {
    const mobile = '09131000005';
    const { devCode } = await requestOtp(mobile);
    const { tokens } = await verifyOtp(mobile, devCode!);

    const rotated = await rotateRefresh(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // W29: a token re-presented IMMEDIATELY after rotation is the silent-
    // refresh timer racing itself, not reuse — it is served (see
    // service.ts#rotateRefresh). This assertion used to run with no window at
    // all, which is precisely the double-fire that would log staff out.
    //
    // Flake fix: rotateRefresh compares real Date.now() millisecond
    // timestamps (spentAgo = now - record.rotatedAt) against
    // REFRESH_REUSE_GRACE_SECONDS*1000. With grace forced to 0 here, the
    // assertion below needs spentAgo > 0 to hold — but two back-to-back
    // Date.now() reads with no real I/O between them can and do land in the
    // same millisecond (spentAgo === 0), which satisfies '<=' and makes the
    // 'reuse' branch spuriously NOT fire, failing this assertion. Reproduced
    // directly (~half of standalone runs). A trivial real delay is enough —
    // this only needs >0ms, not any specific duration — and does not touch
    // rotateRefresh's actual security comparison.
    await new Promise((resolve) => setTimeout(resolve, 5));
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    try {
      await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
    } finally {
      delete process.env.REFRESH_REUSE_GRACE_SECONDS;
    }

    // Logout revokes the current refresh token.
    await logout(rotated.tokens.refreshToken);
    await expect(rotateRefresh(rotated.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });
});
