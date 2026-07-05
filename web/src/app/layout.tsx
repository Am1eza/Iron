import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getCategories } from '@/lib/data/catalog';
import { SiteChromeTop, SiteChromeBottom } from '@/components/layout/SiteChrome';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { vazirmatn, estedad, inter } from '@/lib/theme/fonts';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LocaleScript } from '@/i18n/LocaleScript';
import faMessages from '../../messages/fa.json';

/**
 * Root layout — the RTL, Persian-first shell.
 * <html lang="fa" dir="rtl"> + design tokens (via globals.css).
 * Fonts are self-hosted via `next/font/local` (lib/theme/fonts.ts); Estedad and
 * Vazirmatn preload automatically, and tokens.css consumes their `--font-*`
 * CSS variables (see the `className` below).
 *
 * Multi-language (fa default; en/ar/zh via the header's language switcher)
 * is deliberately layered in client-side (`LocaleProvider`/`LocaleScript`)
 * rather than resolved here via next-intl's server APIs — see
 * `LocaleProvider`'s header comment for why: this layout wraps every route,
 * and any dynamic API call here (cookies()/getLocale()/getMessages() all
 * read the same way) would force the entire app into per-request dynamic
 * rendering, undoing the ISR strategy across ~250 prerendered pages the
 * same way the signed-in session cookie once did (see `AuthHydrator`).
 * Static metadata below is fa-only for the same reason.
 */

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com'),
  title: {
    default: 'آهن‌تایم — بازار هوشمند آهن و فولاد',
    template: '%s | آهن‌تایم',
  },
  description:
    'آهن‌تایم، بازار هوشمند آهن و فولاد: مشاور هوش مصنوعی، قیمت‌های شفاف و لحظه‌ای و زمان تحویل مشخص. اول مشورت، بعد خرید.',
  applicationName: 'آهن‌تایم',
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'آهن‌تایم',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Light-theme page background (--neutral-50): the site is light-only for
  // visitors (see public/theme-init.js), so browser chrome matches — was the
  // dark gunmetal #171C22.
  themeColor: '#F4F7FA',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // No cookies()/headers() read here (and none in anything this layout renders
  // synchronously) — that's deliberate. Any dynamic API call reached from the
  // root layout forces every route in the app into per-request dynamic
  // rendering, silently defeating the ISR/generateStaticParams strategy used
  // across the ~250 prerendered SKU/blog/tool pages. The signed-in user is
  // resolved client-side instead (`AuthHydrator` → `GET /api/me`), which is
  // enough since 100% of auth-driven UI already lives behind Zustand's
  // `useAuthStore`, not server-rendered markup.
  const categories = await getCategories();
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className={`${vazirmatn.variable} ${estedad.variable} ${inter.variable}`}
    >
      <body>
        <ThemeScript />
        <LocaleScript />
        <a href="#main" className="skip-link">
          {faMessages.common.skipToContent}
        </a>
        <LocaleProvider defaultMessages={faMessages}>
          <AppProviders>
            <AuthHydrator />
            <SiteChromeTop categories={categories} />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <SiteChromeBottom categories={categories} />
            <RouteAnnouncer />
          </AppProviders>
        </LocaleProvider>
      </body>
    </html>
  );
}
