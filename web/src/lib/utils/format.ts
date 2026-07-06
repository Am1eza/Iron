/**
 * Persian/RTL formatting helpers — digits, Toman, Jalali dates.
 * (typography.md §2/§6 — Persian numerals, Toman, Jalali, bidi.)
 */
import { format as formatJalaliDate } from 'date-fns-jalali';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** Convert Latin/Arabic digits in a string to Persian digits for display. */
export function toPersianDigits(input: string | number): string {
  return String(input)
    .replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!)
    .replace(/[٠-٩]/g, (d) => FA_DIGITS[d.charCodeAt(0) - 0x0660]!);
}

/** Normalize Persian/Arabic digits in user input back to Latin (for parsing). */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Locale-aware digit display: Persian numerals for fa, Latin for every other
 * locale (en/ar/zh) — Western digits are the standard, widely-understood
 * convention for Arabic/Chinese commerce UI, matching how the rest of this
 * function's callers (Header cart badge, etc.) format counts for display.
 * Accepts the string form so callers can also localize composite values
 * (e.g. already-formatted numbers with separators).
 */
export function localizeDigits(input: string | number, locale: string): string {
  // Non-fa: also swap the Persian thousands separator (٬) for the Latin comma
  // so a fa-formatted composite value renders natively in en/ar/zh.
  return locale === 'fa' ? toPersianDigits(input) : normalizeDigits(String(input)).replace(/٬/g, ',');
}

/** Format an integer Toman value with thousands separators + Persian digits + unit. */
export function formatToman(value: number, withUnit = true): string {
  const grouped = Math.round(value).toLocaleString('en-US'); // 32,450
  const fa = toPersianDigits(grouped).replace(/,/g, '٬'); // Persian thousands sep
  return withUnit ? `${fa} تومان` : fa;
}

/** Format نوسان percent with sign + Persian digits (color/arrow handled in UI). */
export function formatMovement(pct: number | undefined): string {
  if (pct === undefined || Number.isNaN(pct)) return '—';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${toPersianDigits(Math.abs(pct).toFixed(2))}٪`;
}

/** Jalali date for display, e.g. ۱۴۰۵/۰۴/۰۵ */
export function formatJalali(date: Date | string, pattern = 'yyyy/MM/dd'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return toPersianDigits(formatJalaliDate(d, pattern));
}

/** Iranian mobile validation/normalization → 09XXXXXXXXX (or null). */
export function normalizeMobile(input: string): string | null {
  const digits = normalizeDigits(input).replace(/[^\d+]/g, '');
  const m = digits.replace(/^(\+98|0098|98)/, '0');
  return /^09\d{9}$/.test(m) ? m : null;
}
