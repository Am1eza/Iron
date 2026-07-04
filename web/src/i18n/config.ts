/**
 * Canonical locale list for next-intl. Persian (fa) is the default and only
 * locale served without explicit selection — this app runs next-intl in
 * "without i18n routing" mode (cookie-based, no /en, /ar, /zh URL prefixes)
 * by deliberate choice: see GEO-ROUTING.md-adjacent reasoning in
 * i18n/request.ts's header comment for why URL-based locale routing (moving
 * all ~40 pages under a `[locale]` segment) was deferred to a dedicated,
 * separately-tested follow-up rather than done in the same pass as adding
 * languages.
 */
export const LOCALES = ['fa', 'en', 'ar', 'zh'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'fa';

export const LOCALE_COOKIE = 'ahantime_locale';

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
