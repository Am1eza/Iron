/**
 * Canonical locale list for next-intl. Persian (fa) is the default and only
 * locale served bare (no URL prefix) — every other locale is URL-routed via
 * a real `[locale]` segment (`/en/...`, `/ar/...`, `/zh/...`); see
 * `i18n/routing.ts`'s header comment for that migration's rationale. This
 * used to run in a cookie-based "without i18n routing" mode instead — that
 * mode, its `LOCALE_COOKIE`, and the client-side `LocaleProvider` that read
 * it are gone. Locale now always comes from the URL and is resolved entirely
 * server-side: `[locale]/layout.tsx` for the page tree, and `app/layout.tsx`
 * — via the `X-NEXT-INTL-LOCALE` request header `proxy.ts` sets — for
 * `<html lang dir>`, which sits above `[locale]` and cannot read its param.
 * `getDirection` below is the single source of truth for that `dir`.
 */
export const LOCALES = ['fa', 'en', 'ar', 'zh'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'fa';

export const LOCALE_LABELS: Record<AppLocale, string> = {
  fa: 'فارسی',
  en: 'English',
  ar: 'العربية',
  zh: '中文',
};

/** Right-to-left locales — fa and ar. Drives `<html dir>` and CSS logical-property flips. */
export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(['fa', 'ar']);

export function getDirection(locale: AppLocale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale named by next-intl's `X-NEXT-INTL-LOCALE` request header, which
 * `proxy.ts` sets on every public HTML request — the only locale signal
 * available to `app/layout.tsx`, which renders ABOVE the `[locale]` segment
 * and so can never read `params.locale`.
 *
 * Anything unrecognised falls back to fa rather than throwing: the requests
 * that carry no such header are the legitimately Persian ones (the panel
 * host, `/admin/*`, `/panel-login`), and an unknown VALUE should degrade to a
 * readable page in the primary market, not a 500. A wrong `dir` is a layout
 * bug; a crash is an outage.
 */
export function localeFromIntlHeader(value: string | null | undefined): AppLocale {
  return value && isAppLocale(value) ? value : DEFAULT_LOCALE;
}
