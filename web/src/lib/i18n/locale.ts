/**
 * Locale configuration. Ahantime is Persian-first (fa-IR, RTL, Jalali, Toman).
 *
 * fa/en/ar/zh are all live (see src/i18n/* for the actual next-intl runtime —
 * cookie-based locale switching, no URL prefix; src/i18n/config.ts is the
 * canonical locale list the app consumes today). This file predates that
 * work and isn't imported anywhere currently — kept as a reference (the
 * calendar/digit/currency-per-locale intent) rather than deleted; `enabled`
 * now reflects actual state instead of the stale MVP-era false defaults.
 */
export type LocaleCode = 'fa' | 'en' | 'ar' | 'zh';

export type LocaleConfig = {
  code: LocaleCode;
  label: string;
  dir: 'rtl' | 'ltr';
  htmlLang: string;
  calendar: 'jalali' | 'gregorian';
  /** Display numerals: Persian or Latin. */
  digits: 'fa' | 'latin';
  currency: string;
  enabled: boolean;
};

export const LOCALES: Record<LocaleCode, LocaleConfig> = {
  fa: {
    code: 'fa',
    label: 'فارسی',
    dir: 'rtl',
    htmlLang: 'fa',
    calendar: 'jalali',
    digits: 'fa',
    currency: 'تومان',
    enabled: true,
  },
  en: {
    code: 'en',
    label: 'English',
    dir: 'ltr',
    htmlLang: 'en',
    calendar: 'gregorian',
    digits: 'latin',
    currency: 'IRR',
    enabled: true,
  },
  ar: {
    code: 'ar',
    label: 'العربية',
    dir: 'rtl',
    htmlLang: 'ar',
    calendar: 'gregorian',
    digits: 'latin',
    currency: 'IRR',
    enabled: true,
  },
  zh: {
    code: 'zh',
    label: '中文',
    dir: 'ltr',
    htmlLang: 'zh',
    calendar: 'gregorian',
    digits: 'latin',
    currency: 'IRR',
    enabled: true,
  },
};

export const DEFAULT_LOCALE: LocaleCode = 'fa';
export const activeLocale = LOCALES[DEFAULT_LOCALE];
