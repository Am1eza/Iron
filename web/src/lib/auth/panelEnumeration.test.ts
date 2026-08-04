// @vitest-environment node
/**
 * Panel OTP enumeration hardening (W29, audit area 2) + the removal of the
 * public `isNewUser` oracle.
 *
 * On panel.ahantime.com a non-staff number gets `403 not_staff` while a staff
 * number gets `200`, which cleanly separates the two. That distinction is a
 * deliberate UX choice (a staff member who mistypes their number is told so
 * instead of waiting for an SMS that never comes) and is kept. What changes is
 * that probing is no longer FREE and no longer SILENT: the attempt is charged
 * to the per-mobile hourly budget before the 403, so a prober runs out of
 * budget on every number they touch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestDb } from '@/test/db';
import { getDb } from '@/lib/server/db/client';
import { adminAllowlist } from '@/lib/server/db/schema';
import { requestOtp } from './service';
import { getRate, setRate, clearRate } from './store';
import { CONSTANTS } from '@/lib/config/constants';

let close: () => Promise<void>;

const STAFF = '09121110001';
const STRANGER = '09121119999';

beforeAll(async () => {
  ({ close } = await createTestDb());
  await getDb().insert(adminAllowlist).values({ mobile: STAFF, role: 'admin' });
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await clearRate(STRANGER);
  await clearRate(STAFF);
  vi.restoreAllMocks();
});

describe('panel OTP: probing a non-staff number costs quota and is reported', () => {
  it('writes rate state BEFORE the 403 — a probe is no longer free', async () => {
    expect((await getRate(STRANGER)).sends).toHaveLength(0);

    await expect(requestOtp(STRANGER, undefined, true)).rejects.toMatchObject({ code: 'not_staff' });

    // The trace the audit says did not exist.
    expect((await getRate(STRANGER)).sends).toHaveLength(1);
  });

  it('each probe accumulates, and a second one inside the cooldown is a 429, not the oracle', async () => {
    await expect(requestOtp(STRANGER, undefined, true)).rejects.toMatchObject({ code: 'not_staff' });
    // Immediately again: the resend cooldown the first probe just armed now
    // answers instead of the staff gate — the same 429 a STAFF number in this
    // state would get, so the two are no longer distinguishable back to back.
    await expect(requestOtp(STRANGER, undefined, true)).rejects.toMatchObject({ code: 'cooldown' });
  });

  it('a prober exhausts the hourly budget on a number and stops getting the oracle', async () => {
    // Walk the cooldown forward the way an attacker would have to wait it out:
    // OTP_MAX_RESEND_PER_HOUR probes already spent, all inside the hour.
    const spent = Array.from({ length: CONSTANTS.OTP_MAX_RESEND_PER_HOUR }, (_, i) => Date.now() - (i + 1) * 61_000);
    await setRate(STRANGER, { sends: spent });
    await setRate(STAFF, { sends: spent });

    // Budget spent: the answer is now the generic 429, identical to what a
    // STAFF number would return in the same state.
    await expect(requestOtp(STRANGER, undefined, true)).rejects.toMatchObject({ code: 'too_many' });
    await expect(requestOtp(STAFF, undefined, true)).rejects.toMatchObject({ code: 'too_many' });
  });

  it('still lets a genuine staff number through', async () => {
    const res = await requestOtp(STAFF, undefined, true);
    expect(res.ttl).toBeGreaterThan(0);
  });

  it('never applies the staff gate on the public host', async () => {
    const res = await requestOtp(STRANGER, undefined, false);
    expect(res.ttl).toBeGreaterThan(0);
  });
});

describe('public OTP: no isNewUser oracle', () => {
  it('the response cannot distinguish a registered number from an unknown one', async () => {
    const known = '09121112222';
    const unknown = '09121113333';
    const first = await requestOtp(known);
    // Register `known` for real.
    const { verifyOtp } = await import('./service');
    await verifyOtp(known, first.devCode!);

    await clearRate(known);
    const forKnown = await requestOtp(known);
    const forUnknown = await requestOtp(unknown);

    // Same key set, and nothing in it says whether an account exists.
    expect(Object.keys(forKnown).sort()).toEqual(Object.keys(forUnknown).sort());
    expect(forKnown).not.toHaveProperty('isNewUser');
    expect(forUnknown).not.toHaveProperty('isNewUser');
  });
});
