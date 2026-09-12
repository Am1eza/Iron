import { describe, it, expect } from 'vitest';
import {
  isLocaleExempt,
  splitLocalePrefix,
  withLocalePrefix,
  needsDefaultLocaleRewrite,
} from './localePath';

describe('isLocaleExempt', () => {
  it.each([
    ['/admin', true],
    ['/admin/leads', true],
    ['/api', true],
    ['/api/ai/chat', true],
    ['/panel-login', true],
    ['/uploads/x.jpg', true],
    ['/prices/rebar', false],
    ['/', false],
    // Exact-segment, not startsWith — a route named e.g. /apiary must not be
    // swept in by a bare `startsWith('/api')` (same class of bug panelHost.ts
    // guards against for /login vs /logintest).
    ['/apiary', false],
    ['/admins', false],
  ])('%s → %s', (path, expected) => {
    expect(isLocaleExempt(path)).toBe(expected);
  });
});

describe('splitLocalePrefix', () => {
  it('a bare (default-locale) path has no explicit locale', () => {
    expect(splitLocalePrefix('/prices/rebar')).toEqual({
      explicitLocale: null,
      pathWithoutLocale: '/prices/rebar',
    });
    expect(splitLocalePrefix('/')).toEqual({ explicitLocale: null, pathWithoutLocale: '/' });
  });

  it('strips a real locale prefix', () => {
    expect(splitLocalePrefix('/en/prices/rebar')).toEqual({
      explicitLocale: 'en',
      pathWithoutLocale: '/prices/rebar',
    });
    expect(splitLocalePrefix('/ar/about')).toEqual({ explicitLocale: 'ar', pathWithoutLocale: '/about' });
    expect(splitLocalePrefix('/zh')).toEqual({ explicitLocale: 'zh', pathWithoutLocale: '/' });
  });

  it('never matches fa as an explicit prefix — fa is always bare', () => {
    // /fa/prices would be a literal segment named "fa", not the fa locale —
    // there is no such route, so this must NOT be treated as locale-prefixed.
    expect(splitLocalePrefix('/fa/prices').explicitLocale).toBeNull();
  });

  it('does not false-positive on a path merely starting with a locale code', () => {
    // /english-guide is a real (hypothetical) slug, not the "en" locale.
    expect(splitLocalePrefix('/english-guide')).toEqual({
      explicitLocale: null,
      pathWithoutLocale: '/english-guide',
    });
  });
});

describe('withLocalePrefix', () => {
  it('fa gets no prefix at all', () => {
    expect(withLocalePrefix('/prices/rebar', 'fa')).toBe('/prices/rebar');
    expect(withLocalePrefix('/', 'fa')).toBe('/');
  });

  it('every other locale gets prefixed', () => {
    expect(withLocalePrefix('/prices/rebar', 'en')).toBe('/en/prices/rebar');
    expect(withLocalePrefix('/', 'zh')).toBe('/zh');
  });

  it('round-trips with splitLocalePrefix', () => {
    for (const [path, locale] of [
      ['/prices/rebar', 'en'],
      ['/about', 'ar'],
      ['/', 'zh'],
    ] as const) {
      const prefixed = withLocalePrefix(path, locale);
      expect(splitLocalePrefix(prefixed)).toEqual({ explicitLocale: locale, pathWithoutLocale: path });
    }
  });
});

describe('needsDefaultLocaleRewrite', () => {
  it('true for a bare public path — Next needs it rewritten to /fa/... internally', () => {
    expect(needsDefaultLocaleRewrite('/prices/rebar')).toBe(true);
    expect(needsDefaultLocaleRewrite('/')).toBe(true);
  });

  it('false once a path already names a locale', () => {
    expect(needsDefaultLocaleRewrite('/en/prices/rebar')).toBe(false);
  });

  it('false for anything exempt (admin/api/panel-login/uploads) — those never live under [locale]', () => {
    expect(needsDefaultLocaleRewrite('/admin/leads')).toBe(false);
    expect(needsDefaultLocaleRewrite('/api/ai/chat')).toBe(false);
    expect(needsDefaultLocaleRewrite('/panel-login')).toBe(false);
    expect(needsDefaultLocaleRewrite('/uploads/x.jpg')).toBe(false);
  });
});
