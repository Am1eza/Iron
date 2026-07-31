// @vitest-environment node
/** Pure-function units for progressive verification — the parts an auditor
 *  checks: Iranian ID validity, level derivation, and points mapping — plus
 *  the review-queue pagination, which needs a real DB (hence the node
 *  environment; none of the pure units touch the DOM). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  isValidNationalId,
  isValidCompanyNationalId,
  isValidEconomicCode,
  deriveVerificationLevel,
  isProfileComplete,
  listPendingVerifications,
  LEVEL_INFO,
} from './verificationRepo';

describe('isValidNationalId (کد ملی, 10-digit check algorithm)', () => {
  it('accepts valid national IDs (incl. leading zeros)', () => {
    expect(isValidNationalId('1234567891')).toBe(true);
    expect(isValidNationalId('0084575948')).toBe(true);
  });
  it('accepts Persian digits and strips separators', () => {
    expect(isValidNationalId('۱۲۳۴۵۶۷۸۹۱')).toBe(true);
    expect(isValidNationalId('123-456-7891')).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(isValidNationalId('1234567890')).toBe(false);
  });
  it('rejects wrong length and all-same-digit sequences', () => {
    expect(isValidNationalId('12345')).toBe(false);
    expect(isValidNationalId('0000000000')).toBe(false);
    expect(isValidNationalId('1111111111')).toBe(false);
  });
});

describe('company identifiers (format-only; admin review is the gate)', () => {
  it('شناسه ملی is 11 digits', () => {
    expect(isValidCompanyNationalId('10101234567')).toBe(true);
    expect(isValidCompanyNationalId('1010123456')).toBe(false); // 10
  });
  it('کد اقتصادی is 12 digits', () => {
    expect(isValidEconomicCode('411111111111')).toBe(true);
    expect(isValidEconomicCode('41111111111')).toBe(false); // 11
  });
});

describe('deriveVerificationLevel', () => {
  it('phone-only → level 1', () => {
    expect(deriveVerificationLevel({ idVerifyStatus: 'none', bizVerifyStatus: 'none' })).toBe(1);
    expect(deriveVerificationLevel({ idVerifyStatus: 'pending', bizVerifyStatus: 'none' })).toBe(1);
  });
  it('approved personal id → level 2', () => {
    expect(deriveVerificationLevel({ idVerifyStatus: 'approved', bizVerifyStatus: 'none' })).toBe(2);
  });
  it('approved business → level 3 regardless of personal status', () => {
    expect(deriveVerificationLevel({ idVerifyStatus: 'none', bizVerifyStatus: 'approved' })).toBe(3);
    expect(deriveVerificationLevel({ idVerifyStatus: 'approved', bizVerifyStatus: 'approved' })).toBe(3);
  });
});

describe('unlocks by level', () => {
  it('each level exposes a non-empty unlocks list', () => {
    expect(LEVEL_INFO[1].unlocks.length).toBeGreaterThan(0);
    expect(LEVEL_INFO[2].unlocks.length).toBeGreaterThan(0);
    expect(LEVEL_INFO[3].unlocks.length).toBeGreaterThan(0);
  });
});

describe('isProfileComplete', () => {
  it('needs both first and last name', () => {
    expect(isProfileComplete({ firstName: 'رضا', lastName: 'محمدی' })).toBe(true);
    expect(isProfileComplete({ firstName: 'رضا', lastName: undefined })).toBe(false);
    expect(isProfileComplete({ firstName: '  ', lastName: 'محمدی' })).toBe(false);
  });
});

describe('listPendingVerifications (paged review queue)', () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  }, 120_000);
  afterAll(async () => {
    await close();
  });

  async function seedUser(mobile: string, idStatus: string, bizStatus: string) {
    const id = ulid();
    await db.insert(schema.users).values({
      id,
      mobile,
      idVerifyStatus: idStatus as 'pending' | 'none',
      bizVerifyStatus: bizStatus as 'pending' | 'none',
      nationalId: '1234567891',
      companyName: 'فولاد نمونه',
      companyNationalId: '10101234567',
      economicCode: '411111111111',
    });
    return id;
  }

  it('counts REVIEW ITEMS, not users: one user with both pending is two rows', async () => {
    // The trap the UNION ALL exists to close: the old JS fan-out meant the
    // users row count and the emitted item count disagreed, so any `total`
    // derived from the users query was short by exactly this user.
    const both = await seedUser('09120000101', 'pending', 'pending');
    await seedUser('09120000102', 'pending', 'none');
    await seedUser('09120000103', 'none', 'pending');
    await seedUser('09120000104', 'none', 'none'); // nothing to review

    const all = await listPendingVerifications(1, 100);
    expect(all.total).toBe(4); // 2 for `both` + 1 + 1 — not 3 users
    expect(all.pending).toHaveLength(all.total);

    const mine = all.pending.filter((p) => p.userId === both);
    expect(mine.map((p) => p.kind).sort()).toEqual(['biz', 'id']);
    // The DTO shape per kind is unchanged: id rows carry the national id,
    // biz rows carry the company trio and nothing else.
    expect(mine.find((p) => p.kind === 'id')!.nationalId).toBe('1234567891');
    expect(mine.find((p) => p.kind === 'id')!.companyName).toBeUndefined();
    expect(mine.find((p) => p.kind === 'biz')!.companyNationalId).toBe('10101234567');
    expect(mine.find((p) => p.kind === 'biz')!.nationalId).toBeUndefined();
  });

  it('pages exactly: every page is full until the last, and the pages reassemble the total', async () => {
    const total = (await listPendingVerifications(1, 100)).total;
    expect(total).toBe(4);

    const p1 = await listPendingVerifications(1, 3);
    const p2 = await listPendingVerifications(2, 3);
    expect(p1.pending).toHaveLength(3);
    expect(p2.pending).toHaveLength(1);
    expect(p1.total).toBe(total);
    expect(p2.total).toBe(total);
    expect(p2.page).toBe(2);
    expect(p2.perPage).toBe(3);

    // No overlap and no gaps across the page boundary.
    const keys = [...p1.pending, ...p2.pending].map((p) => `${p.userId}:${p.kind}`);
    expect(new Set(keys).size).toBe(total);
  });
});
