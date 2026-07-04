import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getCategories } from '@/lib/data/catalog';
import { SiteChromeTop, SiteChromeBottom } from '@/components/layout/SiteChrome';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { vazirmatn, estedad, inter } from '@/lib/theme/fonts';

/**
 * Root layout — the RTL, Persian-first shell.
 * <html lang="fa" dir="rtl"> + design tokens (via globals.css).
 * Fonts are self-hosted via `next/font/local` (lib/theme/fonts.ts); Estedad and
 * Vazirmatn preload automatically, and tokens.css consumes their `--font-*`
 * CSS variables (see the `className` below).
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
  themeColor: '#171C22',
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
        <a href="#main" className="skip-link">
          پرش به محتوا
        </a>
        <AppProviders>
          <AuthHydrator />
          <SiteChromeTop categories={categories} />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <SiteChromeBottom categories={categories} />
          <RouteAnnouncer />
        </AppProviders>
      </body>
    </html>
  );
}
