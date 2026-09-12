import { defineRouting } from 'next-intl/routing';
import { LOCALES, DEFAULT_LOCALE } from './config';

/**
 * URL-based locale routing (next-intl's official primitive) — replaces the
 * former cookie-only "without i18n routing" mode (see this file's sibling
 * `config.ts` and the removed header comment on `request.ts`/`LocaleProvider`
 * for the history: that mode was a deliberate, documented trade-off to avoid
 * this exact migration, chosen because it is genuinely large — ~54 page
 * trees move under `app/[locale]/`, every `next/link`/`next/navigation`
 * import site needs the locale-aware wrapper below, and `proxy.ts` needs to
 * compose the locale rewrite with its existing panel-host/redirect/404
 * logic. Done anyway, deliberately, because only a real URL per locale makes
 * hreflang (J-audit I-08) and a flash-free server-rendered locale (I-07)
 * possible at all — a cookie can't be read during static generation, which
 * is exactly why the old mode had to fall back to a client-side swap after
 * first paint.
 *
 * `localePrefix: 'as-needed'` — Persian (the default locale, and this site's
 * actual primary market per CLAUDE.md) is served at the bare, unprefixed
 * path exactly as it always has been: `/prices/rebar`, not `/fa/prices/rebar`.
 * Every OTHER locale requires its prefix: `/en/prices/rebar`,
 * `/ar/prices/rebar`, `/zh/prices/rebar`. This is what makes the migration
 * safe for the existing fa traffic/SEO/tests — not one indexed or bookmarked
 * fa URL changes.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
});
