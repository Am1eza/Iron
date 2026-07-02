// @vitest-environment node
/**
 * The OTP flow against the Postgres store (in-process pglite) — proves the
 * facade swap: same service code, sessions/accounts persisted in SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { requestOtp, verifyOtp, rotateRefresh, logout, AuthError } from './service';
import { userByMobile } from './store';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe('OTP auth flow (pg store)', () => {
  it('registers, logs in, rotates and revokes against the database', async () => {
    const mobile = '09135000001';
    const { devCode } = await requestOtp(mobile, 'رضا');
    expect(devCode).toBeTruthy();

    const { user, tokens, isNew } = await verifyOtp(mobile, devCode!);
    expect(isNew).toBe(true);
    expect(user.name).toBe('رضا');

    // Persisted: readable through the store directly.
    const fromDb = await userByMobile(mobile);
    expect(fromDb?.id).toBe(user.id);

    const rotated = await rotateRefresh(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);
    await expect(rotateRefresh(tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);

    await logout(rotated.tokens.refreshToken);
    await expect(rotateRefresh(rotated.tokens.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it('enforces the resend cooldown in SQL', async () => {
    const mobile = '09135000002';
    await requestOtp(mobile);
    await expect(requestOtp(mobile)).rejects.toBeInstanceOf(AuthError);
  });
});
