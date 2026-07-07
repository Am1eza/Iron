import { describe, it, expect } from 'vitest';
import {
  mobileSchema,
  otpCodeSchema,
  requestSchema,
} from './schemas';

describe('mobileSchema', () => {
  it('accepts a valid Iranian mobile', () => {
    expect(mobileSchema.safeParse('09121395954').success).toBe(true);
  });
  it('accepts Persian-digit input', () => {
    expect(mobileSchema.safeParse('۰۹۱۲۱۳۹۵۹۵۴').success).toBe(true);
  });
  it('rejects a landline / malformed number', () => {
    expect(mobileSchema.safeParse('02126297512').success).toBe(false);
  });
});

describe('otpCodeSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true);
  });
  it('rejects the wrong length', () => {
    expect(otpCodeSchema.safeParse('123').success).toBe(false);
    expect(otpCodeSchema.safeParse('12345').success).toBe(false);
  });
});

describe('requestSchema', () => {
  it('passes with valid fields', () => {
    const r = requestSchema.safeParse({
      name: 'رضا',
      mobile: '09121395954',
      channel: 'sms',
    });
    expect(r.success).toBe(true);
  });
  it('fails with an empty name', () => {
    const r = requestSchema.safeParse({ name: '', mobile: '09121395954', channel: 'sms' });
    expect(r.success).toBe(false);
  });
});
