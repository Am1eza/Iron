/**
 * Locale configuration. Poladin is Persian-first (fa-IR, RTL, Jalali, Toman).
 * fa is the only active locale in the MVP; en/ar are reserved (App Router, so no
 * next/i18n routing — locale is a runtime concern, not a URL prefix yet).
 */
export type LocaleCode = 'fa' | 'en' | 'ar';

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
    enabled: false,
  },
  ar: {
    code: 'ar',
    label: 'العربية',
    dir: 'rtl',
    htmlLang: 'ar',
    calendar: 'gregorian',
    digits: 'fa',
    currency: 'تومان',
    enabled: false,
  },
};

export const DEFAULT_LOCALE: LocaleCode = 'fa';
export const activeLocale = LOCALES[DEFAULT_LOCALE];
