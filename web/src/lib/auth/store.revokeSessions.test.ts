// @vitest-environment node
/**
 * revokeSessionsForUser (US-21.3 admin "revoke sessions" action) against the
 * Postgres store — distinct from revokeAllForUser: this must ALSO bump
 * tokenVersion so an already-issued access token dies immediately, not just
 * future refresh attempts. See store.types.ts's doc comment on the method.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { createUser, saveRefresh, findRefresh, userById, revokeSessionsForUser } from './store';

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
