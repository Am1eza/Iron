import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale } from './config';

/**
 * next-intl request config — "without i18n routing" mode (see next-intl's
 * own docs section of that name): the locale is resolved from a cookie, not
 * a URL segment. Chosen deliberately over moving all ~40 existing routes
 * under a `[locale]/` segment: this app just went through a security,
 * accessibility, and SEO audit, has real e2e/unit test coverage keyed to
 * today's flat paths, and admin-gating middleware matches `/admin` directly
 * — restructuring the entire route tree in the same pass as adding
 * languages is a second, much larger and riskier migration that deserves
 * its own dedicated, fully-tested pass. This mode is itself a first-class,
 * documented next-intl setup, not a workaround — upgrading to URL-prefixed
 * locales later (for shareable/indexable per-language URLs) is a supported,
 * incremental next step once ready.
 *
 * Falls back to Accept-Language on first visit (no cookie yet) so a new
 * visitor sees their browser's language before ever choosing one
 * explicitly, then to fa.
 *
 * The static-export build (GitHub Pages mock preview, `EXPORT=1`) has no
 * per-request context at all — `cookies()`/`headers()` cannot be called
 * during static generation — so that path skips straight to the default
 * locale rather than attempting either.
 */
export default getRequestConfig(async () => {
  let locale = DEFAULT_LOCALE;

  if (process.env.EXPORT !== '1') {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    if (cookieLocale && isAppLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const acceptLanguage = (await headers()).get('accept-language') ?? '';
      const preferred = acceptLanguage.split(',')[0]?.split('-')[0]?.trim();
      if (preferred && isAppLocale(preferred)) locale = preferred;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
