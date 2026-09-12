import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * next-intl request config, now driven by the `[locale]` URL segment
 * (`routing.ts`) instead of a cookie. `requestLocale` resolves from the
 * matched route param during both dynamic requests and static generation —
 * no `cookies()`/`headers()` call, so this works identically for an ISR
 * page built at deploy time and a live request, and needs no special case
 * for the static-export preview build (that used to skip straight to the
 * default locale because `cookies()` cannot be called during static
 * generation at all; here there is simply no cookie read to skip).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
