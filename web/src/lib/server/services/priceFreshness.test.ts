import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/server/repos/settingsRepo', () => ({
  getHolidays: async () => new Set<string>(),
  getStaleHideAfterDays: async () => 2,
}));
import { getPriceFreshness } from './priceFreshness';

describe('price timestamp trust boundary', () => {
  it('withholds invalid and future timestamps', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const freshness = await getPriceFreshness(now);
    for (const date of [new Date(NaN), new Date(now.getTime() + 1)]) {
      expect(freshness.isHidden(date)).toBe(true);
      expect(freshness.isStale(date)).toBe(true);
    }
    expect(freshness.isHidden(now)).toBe(false);
    expect(freshness.isStale(now)).toBe(false);
  });
  it('changes stale state at Tehran midnight, not UTC midnight', async () => {
    const freshness = await getPriceFreshness(new Date('2026-09-07T20:30:00Z'));
    expect(freshness.isStale(new Date('2026-09-07T20:29:59Z'))).toBe(true);
    expect(freshness.isHidden(new Date('2026-09-07T20:29:59Z'))).toBe(false);
  });
});
