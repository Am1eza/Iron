// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { PriceRow } from '@/lib/types/domain';
import { priceFacts, formatPriceUpdatedAt } from './priceFacts';

/** Only the fields priceFacts reads; the rest of PriceRow is irrelevant here. */
function row(
  price: number,
  over: Partial<PriceRow['current']> & { factory?: string; basis?: PriceRow['priceBasis'] } = {},
): PriceRow {
  const { factory, basis = 'kg', ...current } = over;
  return {
    factory,
    priceBasis: basis,
    current: {
      price,
      priceBasis: basis,
      updatedAt: '2026-09-18T06:30:00.000Z',
      confirmedAt: '2026-09-18T06:30:00.000Z',
      isStale: false,
      ...current,
    },
  } as unknown as PriceRow;
}

describe('priceFacts', () => {
  it('states nothing when no row has a confirmed price', () => {
    expect(priceFacts([])).toBeNull();
    expect(priceFacts([row(0), row(50_000, { priceHidden: true })])).toBeNull();
  });

  it('never counts a hidden «تماس بگیرید» price or an estimate', () => {
    const facts = priceFacts([
      row(40_000),
      row(45_000),
      row(10, { priceHidden: true }),
      row(999_999, { priceIsEstimated: true }),
    ])!;
    expect(facts).toMatchObject({ pricedCount: 2, min: 40_000, max: 45_000, rangeCount: 2 });
  });

  it('never mixes price bases in one range', () => {
    // A per-kg and a per-bar price have no common range; the range covers the
    // basis most rows use, and says how many rows that is.
    const facts = priceFacts([
      row(40_000),
      row(42_000),
      row(44_000),
      row(1_900_000, { basis: 'branch' }),
    ])!;
    expect(facts).toMatchObject({ rangeBasis: 'kg', rangeCount: 3, min: 40_000, max: 44_000, pricedCount: 4 });
  });

  it('breaks a basis tie toward kg, deterministically', () => {
    expect(priceFacts([row(1_900_000, { basis: 'branch' }), row(40_000)])!.rangeBasis).toBe('kg');
    expect(priceFacts([row(40_000), row(1_900_000, { basis: 'branch' })])!.rangeBasis).toBe('kg');
  });

  it('dates the table by its newest real confirmation, ignoring the epoch sentinel', () => {
    const facts = priceFacts([
      row(40_000, { confirmedAt: '2026-09-17T08:00:00.000Z' }),
      row(41_000, { confirmedAt: '2026-09-18T06:30:00.000Z' }),
      row(42_000, { confirmedAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' }),
    ])!;
    expect(facts.latestAt).toBe('2026-09-18T06:30:00.000Z');
    expect(
      priceFacts([row(40_000, { confirmedAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z' })])!
        .latestAt,
    ).toBeNull();
  });

  it('falls back to updatedAt when a row carries no separate confirmation time', () => {
    const facts = priceFacts([row(40_000, { confirmedAt: undefined, updatedAt: '2026-09-16T10:00:00.000Z' })])!;
    expect(facts.latestAt).toBe('2026-09-16T10:00:00.000Z');
  });

  it('lists mills most-listed first, and only mills the rows actually publish', () => {
    const facts = priceFacts([
      row(1, { factory: 'ذوب‌آهن اصفهان' }),
      row(2, { factory: 'امیرکبیر کاشان' }),
      row(3, { factory: 'امیرکبیر کاشان' }),
      row(4, { factory: '  ' }),
      row(5),
      row(6, { factory: 'نیشابور', priceHidden: true }),
    ])!;
    expect(facts.factories).toEqual(['امیرکبیر کاشان', 'ذوب‌آهن اصفهان']);
  });
});

describe('formatPriceUpdatedAt', () => {
  const iso = '2026-09-18T06:30:00.000Z'; // 10:00 in Tehran (+03:30)

  it('prints Tehran wall-clock time, not the server clock', () => {
    expect(formatPriceUpdatedAt(iso, 'en')).toContain('10:00');
    expect(formatPriceUpdatedAt(iso, 'zh')).toContain('10:00');
  });

  it('uses the Jalali calendar and Persian digits for fa', () => {
    const fa = formatPriceUpdatedAt(iso, 'fa');
    expect(fa).toContain('شهریور');
    expect(fa).toContain('۱۴۰۵');
    expect(fa).toContain('۱۰:۰۰');
  });
});
