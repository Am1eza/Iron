// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { requestOtp, verifyOtp, rotateRefresh, logout, AuthError } from './service';
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

  it('rotates the refresh token (old token becomes invalid)', async () => {
    const mobile = '09131000005';
    const { devCode } = await requestOtp(mobile);
    const { tokens } = await verifyOtp(mobile, devCode!);

    const rotated = await rotateRefresh(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // Reusing the old (rotated-out) refresh token must fail.
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);

    // Logout revokes the current refresh token.
    await logout(rotated.tokens.refreshToken);
    await expect(rotateRefresh(rotated.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });
});
