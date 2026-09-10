// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt';

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET_PREVIOUS;
});

describe('SESSION_SECRET rotation', () => {
  it('accepts tokens signed by the previous key while new tokens use the current key', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32);
    const old = await signAccessToken({ sub: 'u1', mobile: '09120000000', role: 'customer', tv: 0 });
    process.env.SESSION_SECRET_PREVIOUS = 'a'.repeat(32);
    process.env.SESSION_SECRET = 'b'.repeat(32);
    expect((await verifyAccessToken(old.token))?.sub).toBe('u1');
    const fresh = await signAccessToken({ sub: 'u1', mobile: '09120000000', role: 'customer', tv: 0 });
    delete process.env.SESSION_SECRET_PREVIOUS;
    expect(await verifyAccessToken(old.token)).toBeNull();
    expect((await verifyAccessToken(fresh.token))?.sub).toBe('u1');
  });
});
