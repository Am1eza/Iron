// @vitest-environment node
/**
 * `<html lang dir>` is decided by these two functions and nothing else — see
 * `app/layout.tsx`. Before this, every locale was served `lang="fa"
 * dir="rtl"`, so an /en page told non-JS crawlers it was Persian and rendered
 * English right-to-left until a `beforeInteractive` script patched it.
 */
import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, getDirection, isAppLocale, localeFromIntlHeader } from './config';

describe('getDirection', () => {
  it.each([
    ['fa', 'rtl'],
    ['ar', 'rtl'],
    ['en', 'ltr'],
    ['zh', 'ltr'],
  ] as const)('%s renders %s', (locale, dir) => {
    expect(getDirection(locale)).toBe(dir);
  });

  it('has an answer for every locale we serve', () => {
    for (const locale of LOCALES) expect(['rtl', 'ltr']).toContain(getDirection(locale));
  });
});

describe('localeFromIntlHeader', () => {
  it.each(LOCALES)('passes %s through', (locale) => {
    expect(localeFromIntlHeader(locale)).toBe(locale);
  });

  it.each([
    ['null (a panel/admin request, which carries no locale)', null],
    ['undefined', undefined],
    ['empty', ''],
    ['an unserved language', 'de'],
    ['a region-qualified tag we do not route', 'en-GB'],
    ['a path, not a locale', '/en'],
  ])('falls back to the default locale for %s', (_label, value) => {
    expect(localeFromIntlHeader(value)).toBe(DEFAULT_LOCALE);
  });

  it('never returns something getDirection cannot answer', () => {
    expect(isAppLocale(localeFromIntlHeader('nonsense'))).toBe(true);
  });
});
