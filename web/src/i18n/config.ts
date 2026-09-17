/**
 * Canonical locale list for next-intl. Persian (fa) is the default and only
 * locale served bare (no URL prefix) — every other locale is URL-routed via
 * a real `[locale]` segment (`/en/...`, `/ar/...`, `/zh/...`); see
 * `i18n/routing.ts`'s header comment for that migration's rationale. This
 * used to run in a cookie-based "without i18n routing" mode instead — that
 * mode, its `LOCALE_COOKIE`, and the client-side `LocaleProvider` that read
 * it are gone; locale now always comes from the URL, both server-side
 * (`[locale]/layout.tsx`) and client-side (`public/locale-init.js`).
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
