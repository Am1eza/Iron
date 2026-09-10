/**
 * Persian/RTL formatting helpers — digits, Toman, Jalali dates.
 * (typography.md §2/§6 — Persian numerals, Toman, Jalali, bidi.)
 */
import { CONSTANTS } from '@/lib/config/constants';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** Convert Latin/Arabic digits in a string to Persian digits for display. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return FA_DIGITS[code >= 0x0660 ? code - 0x0660 : code - 0x30]!;
  });
}

/** Normalize Persian/Arabic digits in user input back to Latin (for parsing). */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
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
  return locale === 'fa'
    ? toPersianDigits(input)
    : normalizeDigits(String(input)).replace(/٬/g, ',');
}

/**
 * Format an integer Toman value with thousands separators + digits + unit.
 * `locale` defaults to 'fa' so every EXISTING call site (PriceTable,
 * SkuDetail, admin panels, …) keeps its exact historical Persian-digit
 * output — this default is deliberately never changed for them; only a
 * caller that explicitly passes a non-fa locale (Ticker, PriceBoard) opts
 * into localized digits/separator via `localizeDigits`. `withUnit`'s literal
 * "تومان" suffix is likewise unchanged for the fa path; a non-fa caller that
 * wants a translated unit word should pass `withUnit=false` and render its
 * own `t('...')`-sourced unit label beside the digits, same as those two
 * callers already do.
 */
export function formatToman(value: number, withUnit = true, locale: string = 'fa'): string {
  const grouped = Math.round(value).toLocaleString('en-US'); // 32,450
  if (locale !== 'fa') return localizeDigits(grouped, locale);
  const fa = toPersianDigits(grouped).replace(/,/g, '٬'); // Persian thousands sep
  return withUnit ? `${fa} تومان` : fa;
}

/**
 * The «با ارزش‌افزوده» display transform. Lives here, next to `formatToman`,
 * because both the on-screen price cells (`PriceTable`) and the Excel / print /
 * image exports (`ExportMenu`) have to apply the SAME rounding — and PriceTable
 * imports ExportMenu, so it cannot own the helper without a cycle.
 *
 * `rate` is the admin-configured `settings.VAT_RATE`; callers that don't have it
 * fall back to the static default.
 */
export function withVat(price: number, vat: boolean, rate: number = CONSTANTS.VAT_RATE): number {
  return vat ? Math.round(price * (1 + rate)) : price;
}

/**
 * W23 audit fix: `CurrentPrice.priceHidden` (set by `catalogRepo.toPriceRow`
 * when a price has gone stale-hidden — see `priceFreshness.ts`) was only
 * actually checked in ONE of six places that display a price
 * (`FavoritesList.tsx`); every other consumer (`PriceTable`, `SkuDetail`,
 * `PriceBoard`, `FeaturedPrices`, the customer Excel export) rendered the
 * withheld price's literal `0` sentinel as a real number instead. A single
 * shared helper closes that class of bug for good — every price render site
 * calls this FIRST, and only formats the real number when it returns null. */
export function priceHiddenLabel(current: { priceHidden?: boolean; priceIsEstimated?: boolean }): string | null {
  if (current.priceHidden) return 'تماس بگیرید';
  return current.priceIsEstimated ? 'برآورد بازار — قیمت قطعی با استعلام' : null;
}

/**
 * Locale-aware sibling of `priceHiddenLabel` — same fa fast path, but a
 * translated string for the other 3 locales. A plain utility module can't
 * call `useTranslations` itself, so the caller passes in `t` from
 * `useTranslations('common.priceHidden')` (`callForPrice`/`estimated`), the
 * same pattern `formatAlertValueLocalized`/`capLimitCopyLocalized`
 * (`lib/utils/alerts.ts`) already use. `PriceTable.tsx`/`SkuDetail.tsx`
 * still call the fa-only original directly — not touched here, flagged
 * separately as a residual gap outside this change's scope.
 */
export function priceHiddenLabelLocalized(
  current: { priceHidden?: boolean; priceIsEstimated?: boolean },
  locale: string,
  t: (key: 'callForPrice' | 'estimated') => string,
): string | null {
  if (locale === 'fa') return priceHiddenLabel(current);
  if (current.priceHidden) return t('callForPrice');
  return current.priceIsEstimated ? t('estimated') : null;
}

/** Compact Toman for KPI headlines — «۱٫۲ میلیارد», «۳۴۵ میلیون», plain
 *  grouped digits below a million. The unit («تومان») is deliberately NOT
 *  included: BI cards render it separately, small and muted, beside the
 *  headline number. */
export function formatTomanCompact(value: number): string {
  const abs = Math.abs(Math.round(value));
  const compact = (n: number, divisor: number, word: string): string => {
    const v = n / divisor;
    const s = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
    return `${toPersianDigits(s).replace('.', '٫')} ${word}`;
  };
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return sign + compact(abs, 1_000_000_000, 'میلیارد');
  if (abs >= 1_000_000) return sign + compact(abs, 1_000_000, 'میلیون');
  return sign + formatToman(abs, false);
}

/**
 * Format نوسان percent with sign + digits (color/arrow handled in UI).
 * `locale` defaults to 'fa', same rationale as `formatToman` above — existing
 * callers are unaffected; a non-fa caller passes its own locale to get Latin
 * digits and a plain "%" instead of "٪".
 */
export function formatMovement(pct: number | undefined, locale: string = 'fa'): string {
  if (pct === undefined || Number.isNaN(pct)) return '';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const digits = Math.abs(pct).toFixed(2);
  return locale === 'fa'
    ? `${sign}${toPersianDigits(digits)}٪`
    : `${sign}${digits}%`;
}

/* formatJalali lives in ./jalali — see that file's header. Keeping the
   date-fns-jalali import out of this module keeps ~7 kB gz of formatter off
   every page's shared bundle, since almost every client component imports
   something from here. */

/** Iranian mobile validation/normalization → 09XXXXXXXXX (or null). */
export function normalizeMobile(input: string): string | null {
  const normalized = normalizeDigits(input).trim();
  if (!/^(?:\+?\d[\d\s()-]*|\d[\d\s()-]*)$/.test(normalized)) return null;
  const digits = normalized.replace(/[\s()-]/g, '');
  const m = digits.replace(/^(\+98|0098|98)/, '0');
  return /^09\d{9}$/.test(m) ? m : null;
}

/**
 * A *normalized* (09XXXXXXXXX) mobile that structurally can never be a real
 * subscriber line — every digit after the operator prefix is identical, or
 * strictly sequential ascending/descending — the shape of test fixtures,
 * placeholder input, and fraud/spam bots, never a real SIM assignment.
 *
 * Deliberately narrow: Iran's actual operator-prefix-to-carrier map (which
 * numbers are Hamrah-e-Aval vs. Irancell vs. a since-decommissioned MVNO
 * range, etc.) changes over time and has no authoritative source available in
 * this codebase — hardcoding one would risk silently locking out real
 * customers on a newly-assigned prefix, which is worse than the SMS credit
 * this narrower check saves. See docs/audit-auth-F.md#F-134.
 */
export function isObviouslyFakeMobile(mobile: string): boolean {
  const local = mobile.slice(2); // drop the "09" — 9 remaining digits
  if (local.length !== 9) return false;
  if (new Set(local).size === 1) return true;
  const asc = local.split('').every((d, i) => i === 0 || Number(d) === (Number(local[i - 1]) + 1) % 10);
  const desc = local.split('').every((d, i) => i === 0 || Number(d) === (Number(local[i - 1]) + 9) % 10);
  return asc || desc;
}
