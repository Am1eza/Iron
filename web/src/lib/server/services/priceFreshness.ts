/**
 * Single source of truth for price freshness/staleness — used everywhere a
 * `current_prices` row is read (catalog tables, lead/estimate price
 * snapshots, AI tools) so a price hidden in one place is hidden everywhere
 * (acceptance-criteria AC-D-4: never show/quote a stale-hidden price).
 *
 * - `isStale`: not updated within the current Jalali day (display-only —
 *   the UI still shows the number with a "کهنه" badge).
 * - `isHidden`: beyond PRICE_STALE_HIDE_AFTER_DAYS business days — the
 *   price is withheld entirely («تماس بگیرید»), not just flagged.
 */
import { isSameJalaliDay, businessDaysSince } from '@/lib/server/utils/jalali';
import { getHolidays, getStaleHideAfterDays } from '@/lib/server/repos/settingsRepo';

export interface PriceFreshness {
  isStale: (updatedAt: Date) => boolean;
  isHidden: (updatedAt: Date) => boolean;
}

export async function getPriceFreshness(now: Date = new Date()): Promise<PriceFreshness> {
  const [holidays, hideAfter] = await Promise.all([getHolidays(), getStaleHideAfterDays()]);
  return {
    isStale: (updatedAt: Date) => !isSameJalaliDay(updatedAt, now),
    isHidden: (updatedAt: Date) => businessDaysSince(updatedAt, now, holidays) >= hideAfter,
  };
}
