/**
 * URL-locale-prefix logic for `proxy.ts` — pure, independently testable, same
 * rationale as `panelHost.ts` (proxy.ts itself is hard to unit-test directly).
 *
 * `localePrefix: 'as-needed'` (see `i18n/routing.ts`): Persian (default) is
 * served bare (`/prices/rebar`); every other locale requires its prefix
 * (`/en/prices/rebar`). Everything downstream of proxy.ts that reasons about
 * "which page/redirect/known-path is this" (redirects, the 404 guard, the
 * archive-paging rewrite) must reason about the LOCALE-NEUTRAL path — the
 * redirect table and known-catalog-path set were both built, and stay built,
 * without locale prefixes (I-10: catalog/article content is Persian-only
 * across every locale). These helpers strip the prefix before that logic
 * runs and restore the SAME prefix on whatever path the logic produces.
 */
import { LOCALES, DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';

const PREFIXED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/** Prefixes that never live under `[locale]` at all — untouched by any of
 *  this. Kept in one place so proxy.ts and this file can't disagree. */
export const LOCALE_EXEMPT_PREFIXES = ['/admin', '/api', '/panel-login', '/uploads'] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isLocaleExempt(pathname: string): boolean {
  return LOCALE_EXEMPT_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

export interface LocaleSplit {
  /** The locale the URL explicitly names, or null for a bare (default/fa) path. */
  explicitLocale: AppLocale | null;
  /** `pathname` with any explicit locale segment removed — always starts with `/`. */
  pathWithoutLocale: string;
}

/** `/en/prices/rebar` → `{explicitLocale:'en', pathWithoutLocale:'/prices/rebar'}`.
 *  `/prices/rebar` → `{explicitLocale:null, pathWithoutLocale:'/prices/rebar'}`.
 *  `/en` (bare) → `{explicitLocale:'en', pathWithoutLocale:'/'}`. */
export function splitLocalePrefix(pathname: string): LocaleSplit {
  for (const locale of PREFIXED_LOCALES) {
    if (pathname === `/${locale}`) return { explicitLocale: locale, pathWithoutLocale: '/' };
    if (pathname.startsWith(`/${locale}/`)) {
      return { explicitLocale: locale, pathWithoutLocale: pathname.slice(locale.length + 1) };
    }
  }
  return { explicitLocale: null, pathWithoutLocale: pathname };
}

/** Inverse of `splitLocalePrefix`'s prefix half: re-attach `locale`'s prefix
 *  to a locale-neutral path (no-op for the default locale). */
export function withLocalePrefix(pathWithoutLocale: string, locale: AppLocale): string {
  if (locale === DEFAULT_LOCALE) return pathWithoutLocale;
  return pathWithoutLocale === '/' ? `/${locale}` : `/${locale}${pathWithoutLocale}`;
}

/** True for a bare path that Next's router needs rewritten to `/fa/...`
 *  internally so it matches `app/[locale]/...` (fa has no URL prefix). Never
 *  true for an exempt (admin/api/panel-login/uploads) path — those live
 *  outside `[locale]` entirely — nor for a path that already names a locale. */
export function needsDefaultLocaleRewrite(pathname: string): boolean {
  if (isLocaleExempt(pathname)) return false;
  return splitLocalePrefix(pathname).explicitLocale === null;
}

/**
 * ALWAYS prepends `locale`'s segment, including for `fa` — unlike
 * `withLocalePrefix` (which deliberately keeps fa's PUBLIC-facing URL bare).
 * This is for the one place that needs the fa segment anyway: proxy.ts's
 * internal rewrite target, which Next's router must see as `/fa/about` to
 * match `app/[locale]/about/page.tsx` even though the browser's address bar
 * only ever shows `/about`.
 */
export function withInternalLocaleSegment(pathWithoutLocale: string, locale: AppLocale): string {
  return pathWithoutLocale === '/' ? `/${locale}` : `/${locale}${pathWithoutLocale}`;
}
