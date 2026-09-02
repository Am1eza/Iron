/**
 * The status column's whole value is that it agrees with the public page, so
 * the cases here are the ones where the old `price ? green : grey` test and
 * the real rule disagree.
 *
 * Dates are written as Tehran wall-clock instants (`+03:30`) so a reader can
 * check the Jalali-day and Friday reasoning without converting anything. The
 * suite runs in UTC (see vitest.config.ts), which is exactly why the helper
 * must not read the local zone.
 */
import { describe, it, expect } from 'vitest';
import { businessDaysSinceTehran, priceVisibility } from './priceVisibility';

/** Saturday 1405/06/06 = 2026-08-29, the first day of the Iranian week. */
const SAT = new Date('2026-08-29T10:00:00+03:30');
const SUN = new Date('2026-08-30T10:00:00+03:30');
const MON = new Date('2026-08-31T10:00:00+03:30');
/** Thursday, the day before a Friday. */
const THU = new Date('2026-09-03T10:00:00+03:30');
const FRI = new Date('2026-09-04T10:00:00+03:30');
const NEXT_SAT = new Date('2026-09-05T10:00:00+03:30');

describe('businessDaysSinceTehran', () => {
  it('counts nothing within the same Tehran day, even hours apart', () => {
    expect(businessDaysSinceTehran(SAT, new Date('2026-08-29T23:50:00+03:30'))).toBe(0);
  });

  it('counts the days that have completed since, not elapsed 24h periods', () => {
    // 23:50 Saturday → 00:10 Sunday is twenty minutes, and one business day:
    // the price is no longer "today's".
    expect(
      businessDaysSinceTehran(
        new Date('2026-08-29T23:50:00+03:30'),
        new Date('2026-08-30T00:10:00+03:30'),
      ),
    ).toBe(1);
  });

  it('skips Friday', () => {
    // Thursday → Saturday is two calendar days but one business day.
    expect(businessDaysSinceTehran(THU, NEXT_SAT)).toBe(1);
    expect(businessDaysSinceTehran(THU, FRI)).toBe(0);
  });

  it('never goes negative when the timestamp is in the future', () => {
    expect(businessDaysSinceTehran(MON, SAT)).toBe(0);
  });

  it('uses the Tehran day boundary, not the runner’s', () => {
    // 00:30 Tehran on Sunday is still Saturday 21:00 UTC. Counted as a day.
    expect(
      businessDaysSinceTehran(SAT, new Date('2026-08-30T00:30:00+03:30')),
    ).toBe(1);
  });
});

describe('priceVisibility', () => {
  it('reports «no price» for a product nothing has ever priced', () => {
    expect(priceVisibility(null, MON)).toBe('none');
    expect(priceVisibility(undefined, MON)).toBe('none');
  });

  it('reports today’s price as live', () => {
    expect(priceVisibility(SAT, new Date('2026-08-29T19:00:00+03:30'))).toBe('live');
  });

  it('reports yesterday’s price as stale — the site still shows it', () => {
    expect(priceVisibility(SAT, SUN)).toBe('stale');
  });

  it('reports a price past the threshold as hidden — the customer sees «تماس بگیرید»', () => {
    // Two business days: this is the row the old green badge lied about.
    expect(priceVisibility(SAT, MON)).toBe('hidden');
  });

  it('does not count Friday towards the threshold', () => {
    // Thursday → next Sunday is three calendar days but two business ones.
    expect(priceVisibility(THU, NEXT_SAT)).toBe('stale');
    expect(priceVisibility(THU, new Date('2026-09-06T10:00:00+03:30'))).toBe('hidden');
  });

  it('honours a caller-supplied threshold', () => {
    expect(priceVisibility(SAT, MON, 5)).toBe('stale');
    expect(priceVisibility(SAT, SUN, 1)).toBe('hidden');
  });

  it('treats an unparseable timestamp as no price rather than as live', () => {
    expect(priceVisibility('not a date', MON)).toBe('none');
  });
});
