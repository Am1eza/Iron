import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { SiteChromeTop, SiteChromeBottom } from '@/components/layout/SiteChrome';
import { getContact } from '@/lib/server/contact';
import { listMarketValues } from '@/lib/server/repos/marketRepo';
import { hasDb } from '@/lib/server/db/client';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { vazirmatn, inter } from '@/lib/theme/fonts';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LocaleScript } from '@/i18n/LocaleScript';
import { Analytics } from '@/components/analytics/Analytics';
import { AttributionCapture } from '@/components/analytics/AttributionCapture';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import faMessages from '../../messages/fa.json';

/**
 * Root layout — the RTL, Persian-first shell.
 * <html lang="fa" dir="rtl"> + design tokens (via globals.css).
 * Fonts are self-hosted via `next/font/local` (lib/theme/fonts.ts); Vazirmatn
 * preloads automatically, and tokens.css consumes its `--font-*` CSS variable
 * (see the `className` below). Estedad is exported from fonts.ts but no
 * longer wired into any font stack — WebKit fails to render its GPOS
 * mark-attachment (dot) positioning at every weight (confirmed via isolated
 * static + variable instances, both broken, cmap/glyf data intact), silently
 * dropping dots and turning e.g. ق into ف, ش into س. Chromium/Firefox render
 * the same bytes correctly, so this is a WebKit font-engine bug, not
 * something fixable from our CSS/loading code.
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
    default: 'آهن‌تایم، بازار هوشمند آهن و فولاد',
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
  // Google Search Console ownership proof — active only when the env is set.
  ...(process.env.GSC_VERIFICATION
    ? { verification: { google: process.env.GSC_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The keyboard RESIZES the layout viewport instead of overlaying it, so a
  // bottom-docked composer sitting in a `100dvh` shell stays on top of the
  // keyboard rather than behind it (/ai's immersive mobile mode). Without it,
  // `dvh` does not react to the keyboard on iOS Safari and the input is
  // covered exactly when it is being typed into. Ignored by browsers that do
  // not know it, and inert on every page that has no fixed bottom control.
  interactiveWidget: 'resizes-content',
  // Light-theme page background (--neutral-50): the site is light-only for
  // visitors (see public/theme-init.js), so browser chrome matches — was the
  // dark gunmetal #171C22.
  themeColor: '#025652',
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
  const subs = await getSubsMap();
  const contact = await getContact();
  // SEO audit: the ticker used to render a literal "0 / 0.00%" placeholder
  // in the server-rendered HTML for every one of ~1200 pages until the
  // client hydrated and polled `/api/market` a moment later — a real user
  // saw a flash of it, and anything that reads raw HTML without running JS
  // (most non-Google crawlers, some AI answer engines) saw only false
  // financial data. `listMarketValues()` is the exact same Redis-cached
  // (30s) read `/api/market` itself calls, so this adds no new load path —
  // just runs it once more, server-side, before the first paint. Errors
  // are swallowed the same way `hasDb()` gates the API route: a market
  // hiccup must not take the whole site down through the root layout.
  const initialMarketValues = hasDb() ? await listMarketValues().catch(() => undefined) : undefined;
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className={`${vazirmatn.variable} ${inter.variable}`}
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
            <SiteChromeTop
              categories={categories}
              subs={subs}
              initialMarketValues={initialMarketValues}
            />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <SiteChromeBottom categories={categories} contact={contact} />
            <RouteAnnouncer />
            <Analytics />
            <AttributionCapture />
            <ServiceWorkerRegistrar />
          </AppProviders>
        </LocaleProvider>
      </body>
    </html>
  );
}
