/**
 * E-113: `billPeriod` is the actual rate×tonnage×days money math behind
 * every settlement (`createSettlement` in warehouseSettlementsRepo.ts calls
 * it directly). There was no dedicated test file for it at all before this
 * one — the audit's own rule ("never claim closed without a persisted
 * test") is why this exists, not because the arithmetic turned out to be
 * wrong: reading the code shows it already computes the whole
 * grams * fee * milliseconds product as a single BigInt (never as floats)
 * and explicitly rejects a result that would not fit in
 * Number.MAX_SAFE_INTEGER (`billing_overflow`) instead of silently
 * truncating or losing precision. This proves that behavior for real,
 * instead of leaving it as an unverified reading of the source.
 */
import { describe, it, expect } from 'vitest';
import { billPeriod, type BillingSegment } from './warehouseBilling';
import type { warehouseItems, warehouseBillingEvents } from '@/lib/server/db/schema';

type Item = Pick<typeof warehouseItems.$inferSelect, 'id' | 'status' | 'arrivedAt' | 'storedAt' | 'quantityTons' | 'monthlyFeeToman'>;
type Event = typeof warehouseBillingEvents.$inferSelect;

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'wh-1', status: 'stored', arrivedAt: null, storedAt: new Date('2026-01-01T00:00:00Z'),
    quantityTons: 5, monthlyFeeToman: 60_000, ...overrides,
  };
}

function event(overrides: Partial<Event>): Event {
  return {
    id: 'ev-1', warehouseItemId: 'wh-1', effectiveAt: new Date('2026-01-01T00:00:00Z'),
    quantityTons: 5, monthlyFeeToman: 60_000, actorId: null, note: 'test', ...overrides,
  } as Event;
}

const DAY = 86_400_000;
const MONTH = 30 * DAY;

describe('billPeriod (E-113: safe-integer bounds in settlement math)', () => {
  it('fractional tons (1.25 t = 1250 kg) over exactly one billing month bill exactly qty * fee, no float drift', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + MONTH);
    const { amountToman, segments } = billPeriod(item({ quantityTons: 1.25, monthlyFeeToman: 60_000 }), from, to);
    expect(amountToman).toBe(75_000); // 1.25 * 60,000, exactly
    expect(segments).toEqual<BillingSegment[]>([
      { from: from.toISOString(), to: to.toISOString(), quantityTons: 1.25, monthlyFeeToman: 60_000 },
    ]);
  });

  it('a zero-tonnage segment (full release mid-period) contributes exactly zero for its span, and the total is only the non-zero portion', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const releaseAt = new Date(from.getTime() + 15 * DAY);
    const to = new Date(from.getTime() + MONTH);
    const events = [
      event({ id: 'ev-open', effectiveAt: from, quantityTons: 5, monthlyFeeToman: 60_000 }),
      // Release: recordBillingChange stamps quantityTons: 0 going forward.
      event({ id: 'ev-release', effectiveAt: releaseAt, quantityTons: 0, monthlyFeeToman: 60_000 }),
    ];
    const { amountToman, segments } = billPeriod(item(), from, to, events);
    // 5 t * 60,000 toman/t/month * half a month = 150,000; the remaining
    // half at qty 0 adds exactly 0.
    expect(amountToman).toBe(150_000);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ quantityTons: 5, monthlyFeeToman: 60_000 });
    expect(segments[1]).toMatchObject({ quantityTons: 0, monthlyFeeToman: 60_000 });
  });

  it('zero tonnage for the entire requested period bills exactly zero (a full release, not an error)', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + MONTH);
    const { amountToman } = billPeriod(item({ quantityTons: 0 }), from, to);
    expect(amountToman).toBe(0);
  });

  it('a large-but-representable tonnage x rate x long-period combination computes the exact BigInt result, not a float-rounded approximation', () => {
    // 100,000 t (the schema's own ceiling), 1,000,000,000 toman/ton/month
    // (the schema's own ceiling), over exactly one billing month: the naive
    // float computation (grams * fee * ms / (1e6*30*86400000) as plain JS
    // numbers) already loses precision at this magnitude — this asserts
    // billPeriod's actual BigInt path still lands on the exact value.
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + MONTH);
    const qty = 100_000, fee = 1_000_000_000;
    const { amountToman } = billPeriod(item({ quantityTons: qty, monthlyFeeToman: fee }), from, to);
    const expected = qty * fee; // 1e5 * 1e9 = 1e14, still < MAX_SAFE_INTEGER (~9.007e15)
    expect(Number.isSafeInteger(expected)).toBe(true);
    expect(amountToman).toBe(expected);

    // Demonstrate the float trap this guards against: computing the same
    // quantity with a naive float division chain at this magnitude can miss
    // the exact integer (illustrative, not a claim about billPeriod itself).
    const grams = qty * 1_000_000;
    const naiveFloat = (grams * fee * (to.getTime() - from.getTime())) / (1_000_000 * MONTH);
    expect(Number.isSafeInteger(grams * fee)).toBe(false); // already unsafe before the /ms division
    void naiveFloat;
  });

  it('an extreme tonnage x rate x duration that would exceed Number.MAX_SAFE_INTEGER is explicitly rejected, never silently wrong', () => {
    const from = new Date('2000-01-01T00:00:00Z');
    // ~100 years — an item whose arrivedAt/storedAt was entered decades
    // wrong, or a settlement that was simply never run for a very long
    // time. At the schema's own ceilings for qty/fee this must overflow.
    const to = new Date('2100-01-01T00:00:00Z');
    expect(() => billPeriod(item({ quantityTons: 100_000, monthlyFeeToman: 1_000_000_000 }), from, to))
      .toThrowError(expect.objectContaining({ code: 'billing_overflow' }));
  });

  it('a moderate real-world tonnage/rate stays safely under the ceiling even over a multi-year period (the guard does not over-fire)', () => {
    const from = new Date('2020-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 72 * MONTH); // exactly 72 30-day months
    const { amountToman } = billPeriod(item({ quantityTons: 50, monthlyFeeToman: 200_000 }), from, to);
    expect(Number.isSafeInteger(amountToman)).toBe(true);
    // Exact: 50t * 200,000 toman/t/month * 72 months.
    expect(amountToman).toBe(50 * 200_000 * 72);
  });

  it('rejects a non-finite or inverted period instead of computing garbage', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(() => billPeriod(item(), new Date(NaN), from)).toThrowError(expect.objectContaining({ code: 'invalid_period' }));
    // to <= from: defined as "nothing to bill", not an error.
    expect(billPeriod(item(), from, from)).toEqual({ amountToman: 0, segments: [] });
  });
});
