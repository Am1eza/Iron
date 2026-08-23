import { describe, it, expect } from 'vitest';
import { PRICE_REVIEW_AFTER_DAYS, priceAgeDays, priceNeedsReview } from './priceAge';

const NOW = new Date('2026-08-23T20:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('priceAgeDays', () => {
  it('counts whole elapsed days, floored', () => {
    expect(priceAgeDays(NOW, NOW)).toBe(0);
    // 23 hours is still "today's price" — the point of the whole threshold is
    // that it must not fire on a row the morning mirror run just wrote.
    expect(priceAgeDays(new Date(NOW.getTime() - 23 * 3600_000), NOW)).toBe(0);
    expect(priceAgeDays(daysAgo(3), NOW)).toBe(3);
    expect(priceAgeDays(daysAgo(31), NOW)).toBe(31);
  });

  it('accepts the ISO string the admin DTO actually carries', () => {
    expect(priceAgeDays(daysAgo(4).toISOString(), NOW)).toBe(4);
  });

  it('never returns a negative age', () => {
    // Clock skew between the server that stamped `updated_at` and the browser
    // rendering it is real, and «‎−۱ روز» in the grid would read as a bug.
    expect(priceAgeDays(new Date(NOW.getTime() + 5 * 3600_000), NOW)).toBe(0);
  });

  it('returns 0 rather than NaN for an unparseable date', () => {
    expect(priceAgeDays('not a date', NOW)).toBe(0);
  });
});

describe('priceNeedsReview', () => {
  it('fires at the threshold, not before it', () => {
    expect(priceNeedsReview(daysAgo(PRICE_REVIEW_AFTER_DAYS - 1), NOW)).toBe(false);
    expect(priceNeedsReview(daysAgo(PRICE_REVIEW_AFTER_DAYS), NOW)).toBe(true);
    expect(priceNeedsReview(daysAgo(PRICE_REVIEW_AFTER_DAYS + 20), NOW)).toBe(true);
  });

  it('does not fire on a price the twice-daily mirror wrote yesterday', () => {
    // This is the failure the existing same-Jalali-day «کهنه» flag has: it
    // selects hundreds of rows that need nothing done, so nobody reads it.
    expect(priceNeedsReview(daysAgo(1), NOW)).toBe(false);
    expect(priceNeedsReview(daysAgo(3), NOW)).toBe(false);
  });
});
