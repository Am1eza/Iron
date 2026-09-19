/**
 * Jalali date formatting — deliberately its OWN module, not part of
 * lib/utils/format.
 *
 * `format.ts` is imported by nearly every client component (Ticker, Header,
 * BottomTabBar, HeroSearch, …), so its single module-scope
 * `import { format } from 'date-fns-jalali'` put the whole formatter — the
 * locale tables, the token parser, ~25 kB raw / 7.3 kB gz — into the shared
 * bundle downloaded and parsed on EVERY page. Measured on the homepage, not
 * one component there formats a date: it was pure dead weight on the critical
 * path of every visit. Keeping it separate means only the pages that actually
 * print a Jalali date pay for it.
 */
import { format as formatJalaliDate } from 'date-fns-jalali';
import { toPersianDigits } from './format';

/** Jalali date for display, e.g. ۱۴۰۵/۰۴/۰۵ */
export function formatJalali(date: Date | string, pattern = 'yyyy/MM/dd'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return toPersianDigits(formatJalaliDate(d, pattern));
}

/**
 * Locale-aware date for the public pages: Jalali for `fa` (unchanged), a
 * Gregorian date with Latin digits for every other locale — a Jalali year
 * (1405) on an English or Chinese page reads as a wrong date to a foreign
 * buyer. Supports the patterns the public UI uses (`yyyy/MM/dd`, `MM/dd`,
 * `HH:mm` and the `yyyy/MM/dd، HH:mm` combination). Fixed to Tehran time so
 * server and browser render the same day (no hydration mismatch).
 */
export function formatDisplayDate(date: Date | string, pattern = 'yyyy/MM/dd', locale = 'fa'): string {
  if (locale === 'fa') return formatJalali(date, pattern);
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const tokens: Record<string, string> = {
    yyyy: get('year'),
    MM: get('month'),
    dd: get('day'),
    HH: get('hour'),
    mm: get('minute'),
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm/g, (tok) => tokens[tok] ?? tok).replace(/،/g, ',');
}
