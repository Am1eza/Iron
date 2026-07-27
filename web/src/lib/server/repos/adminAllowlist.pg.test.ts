// @vitest-environment node
/**
 * Staff access registry — the invariant «a user holds a staff role ⇔ their
 * mobile is listed, with exactly that row's role», proven against the real pg
 * store (pglite) through the REAL login flow.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { requestOtp, verifyOtp } from '@/lib/auth/service';
import { userByMobile } from '@/lib/auth/store';
import {
  addToAllowlist,
  allowlistCount,
  allowlistedRole,
  bootstrapAllowlist,
  isAllowlisted,
  listAllowlist,
  removeFromAllowlist,
} from './adminAllowlistRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

async function login(mobile: string) {
  const { devCode } = await requestOtp(mobile, 'تست');
  return verifyOtp(mobile, devCode!);
}

describe('admin allowlist (pg)', () => {
  it('an allowlisted mobile is promoted to admin ON LOGIN (first OTP registration included)', async () => {
    await bootstrapAllowlist(['09121395954']);
    expect(await isAllowlisted('09121395954')).toBe(true);

    const { user } = await login('09121395954');
    expect(user.role).toBe('admin');
    expect((await userByMobile('09121395954'))?.role).toBe('admin');
  });

  it('a NON-allowlisted mobile logs in as customer — never admin', async () => {
    const { user } = await login('09135550001');
    expect(user.role).toBe('customer');
  });

  it('removal demotes the user (fail-closed) and their next login stays customer', async () => {
    await bootstrapAllowlist(['09050771309']);
    const first = await login('09050771309');
    expect(first.user.role).toBe('admin');

    const { demotedUserId } = await removeFromAllowlist('09050771309');
    expect(demotedUserId).toBe(first.user.id);
    expect((await userByMobile('09050771309'))?.role).toBe('customer');

    const again = await login('09050771309');
    expect(again.user.role).toBe('customer');
  });

  it('adding an EXISTING user promotes them immediately; tokenVersion bump revokes old JWTs', async () => {
    const before = await login('09135550002');
    expect(before.user.role).toBe('customer');
    const tvBefore = before.user.tokenVersion ?? 0;

    const { promotedUserId } = await addToAllowlist('09135550002', 'مدیر جدید', 'admin', before.user.id);
    expect(promotedUserId).toBe(before.user.id);
    const after = await userByMobile('09135550002');
    expect(after?.role).toBe('admin');
    expect((after?.tokenVersion ?? 0)).toBeGreaterThan(tvBefore);
  });

  it('grants the ROLE the row names — not always admin — and re-roles on change', async () => {
    const u = await login('09135550007');
    await addToAllowlist('09135550007', 'کارشناس فروش', 'sales', u.user.id);
    expect((await userByMobile('09135550007'))?.role).toBe('sales');

    // Same mobile, different role: an upsert, applied immediately.
    await addToAllowlist('09135550007', 'کارشناس فروش', 'content', u.user.id);
    expect((await userByMobile('09135550007'))?.role).toBe('content');
  });

  it('a login by an UNLISTED staff account demotes it back to customer', async () => {
    const u = await login('09135550008');
    await addToAllowlist('09135550008', null, 'catalog', u.user.id);
    expect((await userByMobile('09135550008'))?.role).toBe('catalog');

    await removeFromAllowlist('09135550008');
    expect((await userByMobile('09135550008'))?.role).toBe('customer');
  });

  it('allowlistedRole reports the grant, and null for a stranger', async () => {
    expect(await allowlistedRole('09121395954')).toBe('admin');
    expect(await allowlistedRole('09999999999')).toBeNull();
  });

  it('list joins live user state; bootstrap is idempotent and never removes', async () => {
    const n1 = await allowlistCount();
    await bootstrapAllowlist(['09121395954']); // duplicate — no-op
    expect(await allowlistCount()).toBe(n1);

    const entries = await listAllowlist();
    const e = entries.find((x) => x.mobile === '09121395954');
    expect(e?.userRole).toBe('admin');
  });

  it('PANEL login is refused (and no OTP issued) for a number outside the registry', async () => {
    // panelOnly=true is what the OTP route passes when the request arrives on
    // panel.ahantime.com. A stranger must get a hard error, not a code — this
    // is both the entry gate and the SMS-cost guard.
    await expect(requestOtp('09999999901', 'غریبه', true)).rejects.toMatchObject({
      code: 'not_staff',
      status: 403,
    });
  });

  it('PANEL login proceeds for a listed number', async () => {
    await bootstrapAllowlist(['09121395954']);
    const res = await requestOtp('09121395954', undefined, true);
    expect(res.ttl).toBeGreaterThan(0);
  });
});
