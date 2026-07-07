/** Pure-function units for progressive verification — the parts an auditor
 *  checks: Iranian ID validity, level derivation, and points mapping. */
import { describe, it, expect } from 'vitest';
import {
  isValidNationalId,
  isValidCompanyNationalId,
  isValidEconomicCode,
  deriveVerificationLevel,
  isProfileComplete,
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
