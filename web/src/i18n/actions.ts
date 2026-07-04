'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, isAppLocale } from './config';

/**
 * Sets the locale cookie and revalidates the current tree so every Server
 * Component re-renders with the new locale's messages on the same request
 * (no client-side reload/redirect needed — the caller just re-renders).
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isAppLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
