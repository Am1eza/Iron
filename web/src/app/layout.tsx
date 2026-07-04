import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getSession } from '@/lib/auth/session';
import { getCategories } from '@/lib/data/catalog';
import { SiteChromeTop, SiteChromeBottom } from '@/components/layout/SiteChrome';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { getDirection, type AppLocale } from '@/i18n/config';

/**
 * Root layout — the multi-language shell (fa default; en/ar/zh via the
 * header's language switcher — see src/i18n/request.ts for why this is
 * cookie-based rather than URL-prefixed). `<html lang dir>` are resolved
 * per-request from the active locale; fa/ar are RTL, en/zh are LTR.
 * Fonts are self-hosted via @font-face in tokens.css (add the .woff2 files to /public/fonts).
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const c = await getTranslations({ locale, namespace: 'common' });
  const OG_LOCALE: Record<AppLocale, string> = {
    fa: 'fa_IR',
    en: 'en_US',
    ar: 'ar',
    zh: 'zh_CN',
  };
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com'),
    title: {
      default: t('title'),
      template: `%s | ${c('brand')}`,
    },
    description: t('description'),
    applicationName: c('brand'),
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale],
      siteName: c('brand'),
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#171C22',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [categories, session, locale, messages] = await Promise.all([
    getCategories(),
    getSession(),
    getLocale(),
    getMessages(),
  ]);
  const t = await getTranslations({ locale, namespace: 'common' });
  const initialUser = session
    ? {
        id: session.id,
        mobile: session.mobile,
        name: session.name,
        role: session.role,
      }
    : null;
  return (
    <html lang={locale} dir={getDirection(locale as AppLocale)} suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/Estedad.var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Vazirmatn.var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeScript />
        <a href="#main" className="skip-link">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>
            <AuthHydrator initialUser={initialUser} />
            <SiteChromeTop categories={categories} />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <SiteChromeBottom categories={categories} />
            <RouteAnnouncer />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
