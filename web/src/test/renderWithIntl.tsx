/**
 * Test helper: wrap `render()` with the same `NextIntlClientProvider` the
 * real app tree provides via `LocaleProvider` (see that file's header
 * comment). Any client component that calls `useTranslations()` throws
 * without an ancestor provider — this became a real gap once the i18n audit
 * converted several previously-untranslated components (Ticker, ProductsMenu,
 * MobileDrawer, SearchBar, …) to call it, and their existing unit tests
 * rendered them bare. Defaults to `fa`/`fa.json`, matching what the real
 * root layout actually serves server-side (see `LocaleProvider`'s header
 * comment on why the SSR shell is always `fa`) — a test that needs a
 * different locale passes one explicitly.
 */
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import faMessages from '../../messages/fa.json';

export function renderWithIntl(
  ui: ReactElement,
  options?: { locale?: string; messages?: AbstractIntlMessages },
): RenderResult {
  const locale = options?.locale ?? 'fa';
  const messages = options?.messages ?? faMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tehran">
      {ui}
    </NextIntlClientProvider>,
  );
}
