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
 * locale's message catalog. `LocaleScript` (a `beforeInteractive` script,
 * same trick as `ThemeScript`'s no-FOUC theme flip) fixes `<html lang dir>`
 * before paint; the translated *text* itself swaps a moment later once
 * this component's effect runs — an accepted, brief flash-to-fa for
 * returning non-default-locale visitors, the same class of trade-off as
 * the static-fa-by-default rendering choice itself. Switching locale
 * interactively (the header's LocaleSwitcher) uses the exact same code path
 * with no flash, since it's already client-side.
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

  const applyLocale = useCallback(
    (next: AppLocale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
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

  // Adopt a returning visitor's previously-chosen locale once, on mount.
  useEffect(() => {
    const stored = readCookieLocale();
    if (stored && stored !== DEFAULT_LOCALE) applyLocale(stored);
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
