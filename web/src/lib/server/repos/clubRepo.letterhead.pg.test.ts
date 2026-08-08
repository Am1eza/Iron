// @vitest-environment node
/**
 * پولادی-tier custom letterhead persistence — the part that has to be right
 * for the proforma page's eligibility check (see proforma/[ref]/page.tsx) to
 * ever show the toggle: a logo-only or name-only save must NOT count as
 * usable, and the logo endpoint's write must never clobber the text fields
 * (and vice versa) since they're two separate API calls in the real flow.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { joinClub, getLetterhead, setLetterhead } from './clubRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.users).values([
    { id: 'u-member', mobile: '09120000001', role: 'customer', isActive: true },
    { id: 'u-nonmember', mobile: '09120000002', role: 'customer', isActive: true },
  ]);
  await joinClub('u-member');
}, 120_000);

afterAll(async () => {
  await close();
});

describe('getLetterhead / setLetterhead', () => {
  it('a non-member (no membership row) has no letterhead to read or write', async () => {
    expect(await getLetterhead('u-nonmember')).toBeNull();
    expect(await setLetterhead('u-nonmember', { companyName: 'x' })).toBe(false);
  });

  it('a fresh member starts with every field null', async () => {
    const l = await getLetterhead('u-member');
    expect(l).toEqual({ logoUrl: null, companyName: null, address: null, phone: null });
  });

  it('the logo write does not touch the text fields, and vice versa', async () => {
    expect(await setLetterhead('u-member', { logoUrl: '/uploads/logo1.png' })).toBe(true);
    expect(await getLetterhead('u-member')).toEqual({
      logoUrl: '/uploads/logo1.png',
      companyName: null,
      address: null,
      phone: null,
    });

    expect(
      await setLetterhead('u-member', { companyName: 'شرکت فولاد سازان', address: 'تهران', phone: '02100000000' }),
    ).toBe(true);
    expect(await getLetterhead('u-member')).toEqual({
      // Untouched by the text-only write.
      logoUrl: '/uploads/logo1.png',
      companyName: 'شرکت فولاد سازان',
      address: 'تهران',
      phone: '02100000000',
    });

    // A later logo swap doesn't clobber the text fields either.
    expect(await setLetterhead('u-member', { logoUrl: '/uploads/logo2.png' })).toBe(true);
    const final = await getLetterhead('u-member');
    expect(final?.logoUrl).toBe('/uploads/logo2.png');
    expect(final?.companyName).toBe('شرکت فولاد سازان');
  });
});
