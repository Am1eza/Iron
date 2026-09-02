/**
 * What a customer actually sees for a product's price — the question the
 * catalog list's status column is supposed to answer.
 *
 * The list used to answer a different one. `price ? «روی سایت» : «بدون قیمت»`
 * only asks whether a `current_prices` row exists, but the public side
 * WITHHOLDS a price that has gone `PRICE_STALE_HIDE_AFTER_DAYS` business days
 * without an update and prints «تماس بگیرید» instead (see
 * lib/server/services/priceFreshness.ts). So on an ordinary day the admin read
 * a screen full of green rows for products the customer could not get a price
 * for — precisely the mistake the column exists to prevent.
 *
 * ---------------------------------------------------------------------------
 * Why the arithmetic is repeated here instead of imported
 * ---------------------------------------------------------------------------
 * `priceFreshness` is server-only: it reads the holiday set and the
 * admin-configured threshold out of the settings table, and the admin SKU list
 * DTO carries neither — it sends `price.updatedAt` and nothing else. Until
 * that DTO grows a server-computed `priceHidden` (the right fix; noted as a
 * hand-off), the panel reproduces the rule from the timestamp it does have.
 *
 * Two deliberate differences, both erring the safe way:
 *
 * 1. No holiday list. An official holiday is a non-business day, so ignoring
 *    it can only make this count MORE elapsed business days than the server,
 *    i.e. flag a price as hidden slightly before it really is. A row flagged a
 *    day early sends someone to re-check a price; a row flagged a day late is
 *    the bug being fixed.
 * 2. The threshold is the app default from CONSTANTS rather than the live
 *    settings value. Production overrides it through admin Settings, which is
 *    `settings:read` — a permission a catalog editor need not hold, so
 *    querying it would break the column for exactly the people who use it.
 *
 * Tehran, not the browser's zone: a Jalali day boundary is Tehran midnight,
 * and an admin abroad must still see the same status the customer does. Iran
 * has had no DST since 2022, so the offset is a constant (same assumption, and
 * the same constant, as lib/server/utils/jalali.ts).
 */
import { CONSTANTS } from '@/lib/config/constants';

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the epoch in Tehran — i.e. a comparable calendar day. */
function tehranDayNumber(date: Date): number {
  return Math.floor((date.getTime() + TEHRAN_OFFSET_MS) / DAY_MS);
}

/** Friday is Iran's weekly holiday. Epoch day 0 (1970-01-01) was a Thursday,
 *  so a day number of 1 mod 7 is a Friday. */
function isFriday(dayNumber: number): boolean {
  return ((dayNumber % 7) + 7) % 7 === 1;
}

/**
 * Business days elapsed between two instants — exclusive of `from`'s own day,
 * inclusive of `now`'s, exactly like the server's `businessDaysSince`.
 */
export function businessDaysSinceTehran(from: Date, now: Date): number {
  const start = tehranDayNumber(from);
  const end = tehranDayNumber(now);
  if (end <= start) return 0;
  let count = 0;
  // Bounded: a price untouched for a year is «hidden» long before the loop
  // would matter, and an unbounded walk over a corrupt timestamp would hang
  // the render.
  for (let day = start + 1; day <= end && day - start <= 366; day++) {
    if (!isFriday(day)) count++;
  }
  return count;
}

/**
 * - `none`   — no price row at all; the page shows «تماس بگیرید».
 * - `hidden` — a price exists but is past the hide threshold, so the page
 *              shows «تماس بگیرید» too. The row an admin must act on.
 * - `stale`  — shown to the customer, with a «کهنه» badge (not today's price).
 * - `live`   — priced today.
 */
export type PriceVisibility = 'none' | 'hidden' | 'stale' | 'live';

export function priceVisibility(
  updatedAt: string | Date | null | undefined,
  now: Date = new Date(),
  hideAfterDays: number = CONSTANTS.PRICE_STALE_HIDE_AFTER_DAYS,
): PriceVisibility {
  if (updatedAt == null) return 'none';
  const at = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  // An unparseable timestamp is reported as «بدون قیمت» rather than green:
  // whatever it is, it is not evidence that a customer can see a price.
  if (!Number.isFinite(at.getTime())) return 'none';
  if (businessDaysSinceTehran(at, now) >= hideAfterDays) return 'hidden';
  return tehranDayNumber(at) === tehranDayNumber(now) ? 'live' : 'stale';
}
