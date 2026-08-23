/**
 * How old a stored price is, and when that is old enough for a human to go and
 * check it. US-05.4.
 *
 * ---------------------------------------------------------------------------
 * Why this is NOT `priceFreshness.isStale`
 * ---------------------------------------------------------------------------
 *
 * `isStale` answers a different question, for a different audience, and the
 * two must not be conflated:
 *
 *   isStale        = «this price was not set during the current Jalali day».
 *                    CUSTOMER-FACING — it puts a «کهنه» badge next to the
 *                    number on the public catalogue and tells the AI advisor to
 *                    quote the price with its date attached. It is deliberately
 *                    a same-day window, because a customer deserves to know a
 *                    number was last confirmed yesterday even when yesterday's
 *                    number is still perfectly right.
 *
 *   needsReview    = «nobody, and no mirror run, has touched this price in a
 *                    working week». ADMIN-FACING — it is a work queue.
 *
 * Pointing the admin work queue at `isStale` is what made the existing «فقط
 * کهنه‌ها» filter useless: the mirror runs twice a day and writes about half
 * the catalogue, so by the following morning every OTHER row is «کهنه» and the
 * filter selects hundreds of products, almost none of which need anything
 * doing. A flag that fires on nearly every row communicates nothing.
 *
 * So the customer-facing definition is left exactly as it is — changing it
 * would change what the public site shows, which is a product decision and not
 * one to make from an admin screen — and the admin queue gets its own,
 * genuinely selective threshold here.
 */

/**
 * Days after which a price is treated as needing a manual check.
 *
 * Five, for two reasons that agree:
 *
 * 1. The Iranian working week is Saturday–Wednesday. Five days is exactly one
 *    of them, so «needs review» means «has survived a whole working week with
 *    nobody and nothing touching it» — which is a real failure of the pricing
 *    routine rather than an ordinary quiet stretch.
 * 2. It is above the mirror's own rhythm and below the point where a price is
 *    dangerous. The mirror runs at 08:00 and 12:00 daily, so anything it can
 *    reach is refreshed within hours; a row that has gone five days is a row
 *    the mirror does NOT reach — the structurally un-mirrorable lines (لوله
 *    مسی on a per-coil basis, تسمه مسی with one price for 18 sections,
 *    ساندویچ پانل and گریتینگ on free-text sqm sizes) plus anything a fetch
 *    failure has quietly stopped covering. Those are precisely the rows a
 *    person has to price by hand, and this is the list of them.
 *
 * Deliberately NOT `PRICE_STALE_HIDE_AFTER_DAYS`, which is the point at which
 * the public site withholds the number entirely. By then the damage is already
 * done; this threshold exists to be crossed first.
 */
export const PRICE_REVIEW_AFTER_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between `updatedAt` and `now`, floored, never negative.
 *
 * Calendar days, not business days: this counts how long the number has been
 * sitting there, and a price does not become more current because a Friday
 * intervened. `businessDaysSince` is the right tool for the hide rule, which
 * is a promise about staff response time; it is the wrong one here.
 */
export function priceAgeDays(updatedAt: Date | string, now: Date = new Date()): number {
  const at = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const ms = now.getTime() - at.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

/** Has this price gone long enough without a touch that a person should look? */
export function priceNeedsReview(updatedAt: Date | string, now: Date = new Date()): boolean {
  return priceAgeDays(updatedAt, now) >= PRICE_REVIEW_AFTER_DAYS;
}
