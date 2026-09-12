/**
 * Jalali/Tehran calendar helpers for business rules — price freshness windows,
 * proforma refs (PF-14050410-0021) and quote validity («تا روز کاری بعد، ساعت ۱۱:۰۰»).
 * Iran has no DST since 2022 → fixed UTC+03:30. All helpers are tz-independent
 * (they never rely on the server's local timezone).
 */
import { format as formatJalali } from 'date-fns-jalali';
import { toPersianDigits } from '@/lib/utils/format';

export const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** A Date whose *local* fields equal Tehran wall-clock time (for formatting). */
export function toTehranWallClock(date: Date): Date {
  const utcWallMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  return new Date(utcWallMs + TEHRAN_OFFSET_MS);
}

/** Inverse of toTehranWallClock — real instant from a Tehran wall-clock Date. */
export function fromTehranWallClock(wall: Date): Date {
  const utcWallMs = wall.getTime() - TEHRAN_OFFSET_MS;
  return new Date(utcWallMs - new Date(utcWallMs).getTimezoneOffset() * 60_000);
}

/** Jalali date stamp `14050410` (Tehran) — used in human refs. */
export function jalaliStamp(date: Date = new Date()): string {
  return formatJalali(toTehranWallClock(date), 'yyyyMMdd');
}

/** Jalali `1405-04-10` (Tehran) — used for holidays / day comparisons. */
export function jalaliDayKey(date: Date): string {
  return formatJalali(toTehranWallClock(date), 'yyyy-MM-dd');
}

/** One canonical customer-facing Tehran timestamp. Financial documents and
 * notifications must render the hour from the stored instant itself — never
 * append a hard-coded business hour that can drift from settings. */
export function formatTehranJalaliDateTime(date: Date, pattern = 'yyyy/MM/dd HH:mm'): string {
  return toPersianDigits(formatJalali(toTehranWallClock(date), pattern));
}

/** Same Jalali calendar day in Tehran? (PRICE_FRESH_WINDOW = same day) */
export function isSameJalaliDay(a: Date, b: Date): boolean {
  return jalaliDayKey(a) === jalaliDayKey(b);
}

/** The real instant that is Tehran midnight of `date`'s Jalali day — for
 *  "since the start of today" queries (J-236: the AI daily token budget used
 *  to reset at Node's local/UTC midnight, ~3.5h off from the Tehran day every
 *  other "daily" business rule in this app uses). */
export function startOfTehranDay(date: Date): Date {
  const wall = toTehranWallClock(date);
  wall.setHours(0, 0, 0, 0);
  return fromTehranWallClock(wall);
}

/**
 * The weekly closure, as JS `getDay()` numbers: Thursday (4) and Friday (5).
 *
 * Friday is Iran's statutory weekly holiday; Thursday is this company's — the
 * office is shut, confirmed by Amir on 2026-09-07. Treating Thursday as a
 * working day made «تا روز کاری بعد» land on a day nobody is here to honour
 * the quote: a proforma issued Wednesday expired Thursday 11:00 with the phone
 * unanswered from Wednesday evening until Saturday morning, and price
 * staleness aged a day the prices were never going to be updated on.
 *
 * Structural, not in the `holidays` setting: that set is for one-off calendar
 * holidays (Nowruz, عید), which are entered per year and would otherwise need
 * every Thursday of every year typed into it by hand.
 */
const WEEKLY_CLOSURE_DAYS: readonly number[] = [4, 5];

function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const wall = toTehranWallClock(date);
  return !WEEKLY_CLOSURE_DAYS.includes(wall.getDay()) && !holidays.has(jalaliDayKey(date));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole business days elapsed between `from` and `now` (Tehran days, exclusive
 * of `from`'s day, inclusive of completed days). Drives PRICE_STALE_HIDE_AFTER.
 */
export function businessDaysSince(from: Date, now: Date, holidays: ReadonlySet<string> = new Set()): number {
  if (now.getTime() <= from.getTime()) return 0;
  let count = 0;
  // Walk day by day from the day after `from` up to `now`'s day.
  let cursor = new Date(from.getTime());
  for (let i = 0; i < 366; i++) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (jalaliDayKey(cursor) > jalaliDayKey(now) || cursor.getTime() > now.getTime() + DAY_MS) break;
    if (jalaliDayKey(cursor) === jalaliDayKey(now)) {
      if (isBusinessDay(cursor, holidays)) count++;
      break;
    }
    if (isBusinessDay(cursor, holidays)) count++;
  }
  return count;
}

/**
 * QUOTE_VALIDITY: the next business day at `hour`:00 Tehran, as a real instant.
 * (acceptance-criteria §1.4 — «تا روز کاری بعد، ساعت ۱۱:۰۰»)
 */
export function quoteValidUntil(
  now: Date = new Date(),
  holidays: ReadonlySet<string> = new Set(),
  hour = 11,
): Date {
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 30; i++) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isBusinessDay(cursor, holidays)) {
      const wall = toTehranWallClock(cursor);
      wall.setHours(hour, 0, 0, 0);
      return fromTehranWallClock(wall);
    }
  }
  return new Date(now.getTime() + DAY_MS); // unreachable safety
}
