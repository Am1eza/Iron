import { act, render, screen, waitFor } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider, useSetLocale } from './LocaleProvider';
import { LOCALE_COOKIE } from './config';
import faMessages from '../../messages/fa.json';

// `nav.home` (unlike `common.brand`, which happens to be the Latin
// "Ahantime" in en/ar/zh alike) has a distinct value in all 4 locales —
// خانه / Home / الرئيسية / 首页 — so it actually proves WHICH catalog loaded.
function Probe() {
  const t = useTranslations('nav');
  return <span data-testid="home">{t('home')}</span>;
}

function SwitchTo({ locale }: { locale: 'fa' | 'en' | 'ar' | 'zh' }) {
  const setLocale = useSetLocale();
  return (
    <button type="button" onClick={() => setLocale(locale)}>
      switch
    </button>
  );
}

function clearCookie() {
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
}

function stubBrowserLanguage(...langs: string[]) {
  Object.defineProperty(window.navigator, 'language', { value: langs[0], configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true });
}

describe('LocaleProvider — first-visit browser-language detection', () => {
  beforeEach(() => {
    clearCookie();
    stubBrowserLanguage('fa');
  });
  afterEach(() => clearCookie());

  it('renders fa immediately (no flash) when the browser language is fa', () => {
    stubBrowserLanguage('fa-IR', 'fa');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('home')).toHaveTextContent('خانه');
  });

  it('switches to the browser language when no cookie has ever been set', async () => {
    stubBrowserLanguage('en-US', 'en');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    // Before request.ts's server-side Accept-Language fallback had a
    // client-side equivalent, this stayed 'خانه' (fa) forever — see
    // LocaleProvider's header comment. Confirms the fix actually renders the
    // detected locale's real message catalog, not just an attribute flip.
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('Home'));
  });

  it('picks the first supported language out of a preference list', async () => {
    // Accept-Language-style list where the top preference is unsupported.
    stubBrowserLanguage('fr-FR', 'fr', 'zh-CN', 'zh');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('首页'));
  });

  it('ignores an unsupported browser language and stays on fa', async () => {
    stubBrowserLanguage('fr-FR', 'fr', 'de');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('home')).toHaveTextContent('خانه');
  });

  it('does NOT persist a cookie for an auto-detected locale', async () => {
    stubBrowserLanguage('ar-SA', 'ar');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('الرئيسية'));
    // Undecided visitors are re-detected every session (their OS/browser
    // language is the live source of truth) rather than locked in by a
    // cookie they never chose to set — see applyLocale's `persist` comment.
    expect(document.cookie).not.toContain(LOCALE_COOKIE);
  });

  it('prefers a stored cookie over the browser language', async () => {
    document.cookie = `${LOCALE_COOKIE}=zh; path=/`;
    stubBrowserLanguage('en-US', 'en');
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <Probe />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('首页'));
  });

  it('an explicit switch via useSetLocale persists the cookie', async () => {
    render(
      <LocaleProvider defaultMessages={faMessages}>
        <SwitchTo locale="en" />
        <Probe />
      </LocaleProvider>,
    );
    screen.getByRole('button').click();
    await waitFor(() => expect(screen.getByTestId('home')).toHaveTextContent('Home'));
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
  });
});
