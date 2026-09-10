import { describe, it, expect } from 'vitest';
import {
  mobileSchema,
  otpCodeSchema,
  requestSchema,
  contactSchema,
  cooperationSchema,
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
  it('rejects an oversized name (H-173)', () => {
    const r = requestSchema.safeParse({ name: 'ا'.repeat(61), mobile: '09121395954', channel: 'sms' });
    expect(r.success).toBe(false);
  });
});

describe('contactSchema (H-173: text fields are length-capped)', () => {
  it('passes with valid fields', () => {
    const r = contactSchema.safeParse({ name: 'رضا', mobile: '09121395954', message: 'سلام، سوالی دارم.' });
    expect(r.success).toBe(true);
  });
  it('rejects an oversized name', () => {
    const r = contactSchema.safeParse({ name: 'ا'.repeat(61), mobile: '09121395954', message: 'سلام، سوالی دارم.' });
    expect(r.success).toBe(false);
  });
  it('rejects an oversized message', () => {
    const r = contactSchema.safeParse({ name: 'رضا', mobile: '09121395954', message: 'ا'.repeat(2001) });
    expect(r.success).toBe(false);
  });
});

describe('cooperationSchema (H-173: text fields are length-capped)', () => {
  it('passes with valid fields', () => {
    const r = cooperationSchema.safeParse({ track: 'supply', company: 'شرکت آهن', mobile: '09121395954' });
    expect(r.success).toBe(true);
  });
  it('rejects an oversized company name', () => {
    const r = cooperationSchema.safeParse({ track: 'supply', company: 'ا'.repeat(121), mobile: '09121395954' });
    expect(r.success).toBe(false);
  });
  it('rejects an oversized free-text message', () => {
    const r = cooperationSchema.safeParse({
      track: 'supply', company: 'شرکت آهن', mobile: '09121395954', message: 'ا'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});
