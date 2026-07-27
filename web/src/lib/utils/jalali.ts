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
