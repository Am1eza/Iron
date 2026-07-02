/**
 * Pure unit coverage for the Jalali/Tehran business-day rules — the boundary
 * cases (Friday, holidays, same-day) that the integration suites don't
 * exercise directly since they only hit one path each incidentally.
 */
import { describe, it, expect } from 'vitest';
import { quoteValidUntil, businessDaysSince, isSameJalaliDay, jalaliDayKey } from './jalali';

describe('quoteValidUntil', () => {
  it('Thursday → next business day is Saturday (Friday skipped)', () => {
    const thu = new Date('2026-07-02T10:00:00.000Z'); // Thu in Tehran
    const until = quoteValidUntil(thu, new Set(), 11);
    expect(until.getUTCDay()).not.toBe(5);
    expect(jalaliDayKey(until)).not.toBe(jalaliDayKey(thu));
  });

  it('Wednesday night → lands on Thursday, not Friday', () => {
    // 2026-07-01 is a Wednesday in Tehran.
    const wed = new Date('2026-07-01T10:00:00.000Z');
    const until = quoteValidUntil(wed, new Set(), 11);
    expect(until.getUTCDay()).not.toBe(5);
    expect(until.toISOString()).toContain('T07:30:00');
  });

  it('skips a holiday even on an otherwise-open weekday', () => {
    const wed = new Date('2026-07-01T10:00:00.000Z');
    const nextDayKey = jalaliDayKey(new Date(wed.getTime() + 24 * 60 * 60 * 1000));
    const withoutHoliday = quoteValidUntil(wed, new Set(), 11);
    const withHoliday = quoteValidUntil(wed, new Set([nextDayKey]), 11);
    expect(jalaliDayKey(withHoliday)).not.toBe(nextDayKey);
    expect(withHoliday.getTime()).toBeGreaterThan(withoutHoliday.getTime());
  });

  it('always lands at exactly {hour}:00 Tehran wall-clock', () => {
    const now = new Date('2026-07-01T03:00:00.000Z');
    const until = quoteValidUntil(now, new Set(), 9);
    // 09:00 Tehran == 05:30 UTC
    expect(until.toISOString()).toContain('T05:30:00');
  });
});

describe('businessDaysSince', () => {
  it('returns 0 for the same instant or `now` before `from`', () => {
    const t = new Date('2026-07-01T10:00:00.000Z');
    expect(businessDaysSince(t, t)).toBe(0);
    expect(businessDaysSince(t, new Date(t.getTime() - DAY))).toBe(0);
  });

  it('counts one business day for a same-week weekday gap', () => {
    // Wed → Thu is one business day.
    const wed = new Date('2026-07-01T10:00:00.000Z');
    const thu = new Date(wed.getTime() + DAY);
    expect(businessDaysSince(wed, thu)).toBe(1);
  });

  it('does not count Friday as a business day', () => {
    // Thu → Sat spans one Friday; only Saturday counts.
    const thu = new Date('2026-07-02T10:00:00.000Z');
    const sat = new Date(thu.getTime() + 2 * DAY);
    expect(businessDaysSince(thu, sat)).toBe(1);
  });

  it('excludes admin-configured holidays from the count', () => {
    const wed = new Date('2026-07-01T10:00:00.000Z');
    const thu = new Date(wed.getTime() + DAY);
    const thuKey = jalaliDayKey(thu);
    expect(businessDaysSince(wed, thu, new Set([thuKey]))).toBe(0);
  });
});

describe('isSameJalaliDay', () => {
  it('true for two instants on the same Tehran calendar day', () => {
    const morning = new Date('2026-07-01T01:00:00.000Z'); // 04:30 Tehran
    const night = new Date('2026-07-01T19:00:00.000Z'); // 22:30 Tehran
    expect(isSameJalaliDay(morning, night)).toBe(true);
  });

  it('false across the Tehran midnight boundary (UTC+3:30)', () => {
    // 20:35 UTC == 00:05 next day in Tehran.
    const before = new Date('2026-07-01T20:00:00.000Z');
    const after = new Date('2026-07-01T20:35:00.000Z');
    expect(isSameJalaliDay(before, after)).toBe(false);
  });
});

const DAY = 24 * 60 * 60 * 1000;
