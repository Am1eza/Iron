'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale, type AppLocale } from './config';

/**
 * Client-driven locale switching — deliberately NOT server-resolved.
 *
 * The root layout wraps every route in this app; reading the locale cookie
 * there (`cookies()`, or next-intl's `getLocale()`/`getMessages()`, which do
 * the same thing internally) would force every single page into per-request
 * dynamic rendering, silently undoing this app's ISR strategy across ~250
 * prerendered pages — see `AuthHydrator`'s header comment, which hit and
 * fixed the exact same problem for the signed-in session cookie. This file
 * follows that established pattern instead: the server always renders the
 * static, cacheable `fa` (Persian) shell — SEO/first paint/ISR cache all see
 * Persian, which is also this site's actual primary-market default — and a
 * returning visitor who previously chose another language is switched to it
 * client-side, immediately after mount, by dynamically importing that
 * locale's message catalog. `LocaleScript` fixes `<html lang dir>` before
 * paint; interactive switching uses the same loading path.
 */

const MESSAGE_LOADERS: Record<AppLocale, () => Promise<{ default: AbstractIntlMessages }>> = {
  fa: () => import('../../messages/fa.json'),
  en: () => import('../../messages/en.json'),
  ar: () => import('../../messages/ar.json'),
  zh: () => import('../../messages/zh.json'),
};

function readCookieLocale(): AppLocale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return value && isAppLocale(value) ? value : null;
}

/**
 * A visitor's browser language, for the case where they have never chosen
 * one explicitly (no cookie yet). `request.ts` already resolves
 * Accept-Language server-side, but that resolution never reaches this
 * component — the server always renders the static `fa` shell (see this
 * file's header comment) — so without this, "falls back to Accept-Language"
 * was true only for the one API route that calls next-intl's server
 * `getTranslations()`, never for the page a visitor actually sees. Mirrors
 * `locale-init.js`'s detection so `<html lang dir>` and the rendered text
 * agree from the first frame onward.
 */
function readBrowserLocale(): AppLocale | null {
  if (typeof navigator === 'undefined') return null;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of langs) {
    const primary = lang?.split('-')[0]?.toLowerCase();
    if (primary && isAppLocale(primary)) return primary;
  }
  return null;
}

function applyDomAttributes(locale: AppLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'fa' || locale === 'ar' ? 'rtl' : 'ltr';
}

const SetLocaleContext = createContext<(locale: AppLocale) => void>(() => {});

/** Used by LocaleSwitcher to change locale instantly, client-side, no server round-trip. */
export function useSetLocale() {
  return useContext(SetLocaleContext);
}

export function LocaleProvider({
  defaultMessages,
  children,
}: {
  defaultMessages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<AbstractIntlMessages>(defaultMessages);

  // `persist` is false only for one-off browser-language auto-detection: an
  // undecided visitor should be re-detected every session (their OS/browser
  // language is the live source of truth), not locked in by a cookie they
  // never chose to set. An explicit pick via LocaleSwitcher always persists.
  const applyLocale = useCallback(
    (next: AppLocale, persist = true) => {
      if (persist) {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
      applyDomAttributes(next);
      if (next === DEFAULT_LOCALE) {
        setLocale(DEFAULT_LOCALE);
        setMessages(defaultMessages);
        return;
      }
      void MESSAGE_LOADERS[next]().then((mod) => {
        setLocale(next);
        setMessages(mod.default);
      });
    },
    [defaultMessages],
  );

  // Adopt a returning visitor's previously-chosen locale once, on mount; a
  // first-time visitor with no cookie yet gets their browser language
  // instead, matching what `request.ts`'s (server-only) Accept-Language
  // fallback has always claimed to do but, without this, never actually did
  // for the rendered page — see `readBrowserLocale`'s comment.
  useEffect(() => {
    const stored = readCookieLocale();
    if (stored) {
      if (stored !== DEFAULT_LOCALE) applyLocale(stored);
      return;
    }
    const detected = readBrowserLocale();
    if (detected && detected !== DEFAULT_LOCALE) applyLocale(detected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SetLocaleContext.Provider value={applyLocale}>
      {/* Fixed to the business's own timezone (matches jalali.ts's Tehran-locked
          date logic) rather than left unset, which otherwise makes next-intl
          warn on every render about a possible server/client markup mismatch. */}
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tehran">
        {children}
      </NextIntlClientProvider>
    </SetLocaleContext.Provider>
  );
}
