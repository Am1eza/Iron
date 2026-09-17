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
import { cache } from 'react';
import { isSameJalaliDay, businessDaysSince } from '@/lib/server/utils/jalali';
import { getHolidays, getStaleHideAfterDays } from '@/lib/server/repos/settingsRepo';

export interface PriceFreshness {
  isStale: (updatedAt: Date) => boolean;
  isHidden: (updatedAt: Date) => boolean;
}

/**
 * The two settings reads behind `getPriceFreshness`, request-deduped. Keyed
 * on the second `now` falls in (not `now` itself, which is a fresh `Date` on
 * every default-argument call and would never hit as a `cache()` key) — the
 * settings this reads are day/business-day granularity, so a request that
 * happens to straddle a second boundary is harmless. Callers on the homepage
 * alone invoke `getPriceFreshness()` once per category (`tableRows`, in
 * `catalogRepo.ts`) — 8 categories, 8 otherwise-redundant `getHolidays` +
 * `getStaleHideAfterDays` round trips per render before this existed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- cache() key only, see comment above
const getFreshnessSettings = cache(async (_nowSecond: number) => {
  const [holidays, hideAfter] = await Promise.all([getHolidays(), getStaleHideAfterDays()]);
  return { holidays, hideAfter };
});

export async function getPriceFreshness(now: Date = new Date()): Promise<PriceFreshness> {
  const { holidays, hideAfter } = await getFreshnessSettings(Math.floor(now.getTime() / 1000));
  const invalid = (date: Date) => !Number.isFinite(date.getTime()) || date.getTime() > now.getTime();
  return {
    isStale: (updatedAt: Date) => invalid(updatedAt) || !isSameJalaliDay(updatedAt, now),
    isHidden: (updatedAt: Date) => invalid(updatedAt) || businessDaysSince(updatedAt, now, holidays) >= hideAfter,
  };
}
