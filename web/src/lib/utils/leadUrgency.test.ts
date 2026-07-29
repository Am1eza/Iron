/** urgencyOf mirrors the server's URGENCY_TIER (leadsRepo.ts) — a mismatch
 *  here means the row badge disagrees with the order the list is sorted in. */
import { describe, it, expect } from 'vitest';
import { urgencyOf } from './leadUrgency';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function lead(patch: Partial<Parameters<typeof urgencyOf>[0]>) {
  return {
    status: 'new' as const,
    createdAt: iso(NOW.getTime()),
    updatedAt: iso(NOW.getTime()),
    callbackAt: null,
    ...patch,
  };
}

describe('urgencyOf — new leads', () => {
  it('stays quiet for a lead less than 30 minutes old', () => {
    expect(urgencyOf(lead({ createdAt: iso(NOW.getTime() - 10 * 60_000) }), NOW)).toBeNull();
  });

  it('nudges (warning) between 30 minutes and 2 hours', () => {
    expect(urgencyOf(lead({ createdAt: iso(NOW.getTime() - 45 * 60_000) }), NOW)).toMatchObject({ tone: 'warning' });
  });

  it('flags (loss) once 2+ hours have passed with no contact', () => {
    expect(urgencyOf(lead({ createdAt: iso(NOW.getTime() - 3 * HOUR) }), NOW)).toEqual({
      label: '۳ ساعت بدون تماس',
      tone: 'loss',
    });
  });

  it('switches to a day count past 24 hours', () => {
    expect(urgencyOf(lead({ createdAt: iso(NOW.getTime() - 2 * DAY) }), NOW)).toEqual({
      label: '۲ روز بدون تماس',
      tone: 'loss',
    });
  });
});

describe('urgencyOf — contacted leads', () => {
  it('is silent when a callback is set but not yet due — already shown elsewhere', () => {
    expect(urgencyOf(lead({ status: 'contacted', callbackAt: iso(NOW.getTime() + HOUR) }), NOW)).toBeNull();
  });

  it('flags an overdue callback regardless of how stale updatedAt is', () => {
    expect(
      urgencyOf(
        lead({ status: 'contacted', callbackAt: iso(NOW.getTime() - 26 * HOUR), updatedAt: iso(NOW.getTime() - 10 * DAY) }),
        NOW,
      ),
    ).toEqual({ label: 'پیگیری ۱ روز عقب‌افتاده', tone: 'loss' });
  });

  it('flags a no-plan lead only once it has sat a while (updatedAt proxy)', () => {
    expect(urgencyOf(lead({ status: 'contacted', updatedAt: iso(NOW.getTime() - 12 * HOUR) }), NOW)).toBeNull();
    expect(urgencyOf(lead({ status: 'contacted', updatedAt: iso(NOW.getTime() - 4 * DAY) }), NOW)).toEqual({
      label: '۴ روز بدون پیگیری',
      tone: 'loss',
    });
  });
});

describe('urgencyOf — closed leads', () => {
  it('never flags won or lost, no matter how old', () => {
    expect(urgencyOf(lead({ status: 'won', createdAt: iso(NOW.getTime() - 30 * DAY) }), NOW)).toBeNull();
    expect(urgencyOf(lead({ status: 'lost', updatedAt: iso(NOW.getTime() - 30 * DAY) }), NOW)).toBeNull();
  });
});
