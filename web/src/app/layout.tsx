import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { SkipLink } from '@/components/a11y/SkipLink';
import { vazirmatn, inter } from '@/lib/theme/fonts';
import { LocaleScript } from '@/i18n/LocaleScript';
import { Analytics } from '@/components/analytics/Analytics';
import { AttributionCapture } from '@/components/analytics/AttributionCapture';
import { InteractionAnalytics } from '@/components/analytics/InteractionAnalytics';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import faMessages from '../../messages/fa.json';

/**
 * Root layout — the TRUE Next.js root (the one place `<html><body>` may
 * appear), shared by BOTH `/admin/*` (which never lives under `[locale]` —
 * the panel is Persian-only for staff) and the public `[locale]/*` tree.
 * Because it sits ABOVE `[locale]` in the route tree it cannot read
 * `params.locale` (a parent layout renders before a child dynamic segment is
 * resolved) — so `<html lang dir>` stays a static Persian default here,
 * fixed to the REQUEST's real locale before paint by `LocaleScript`
 * (`public/locale-init.js`, now reading the URL path instead of a cookie —
 * see that file's header comment) exactly the same way `ThemeScript` fixes
 * `data-theme` before paint. This is the identical trade-off the old
 * cookie-based i18n setup already made and documented; only the SOURCE of
 * truth for "which locale is this" moved from a cookie to the URL.
 *
 * Everything genuinely PUBLIC-SITE-specific — the ticker/header/footer
 * (`SiteChrome`) and the locale-correct `NextIntlClientProvider` — moved to
 * `app/[locale]/layout.tsx`, which nests inside this one. The
 * `NextIntlClientProvider` here (fa, static import) is the exact fallback
 * every route already got before this migration (initial SSR was always fa
 * regardless of locale) — it exists so a shared component that calls
 * `useTranslations()` from `/admin/*` (outside `[locale]`) never crashes for
 * want of a provider; `[locale]/layout.tsx` nests a second, correctly-scoped
 * provider on top of it for public pages.
 *
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
 */

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com'),
  title: {
    default: 'آهن‌تایم؛ بازار هوشمند خرید و فروش آهن‌آلات و فولاد ایران',
    template: '%s | آهن‌تایم',
  },
  description:
    'آهن‌تایم، بازار هوشمند خرید و فروش آهن‌آلات و فولاد ایران: مشاور هوش مصنوعی، قیمت‌های شفاف و لحظه‌ای، پیش‌فاکتور رسمی و زمان تحویل مشخص. اول مشورت، بعد خرید.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      // Next.js 16 stopped overriding `scroll-behavior` during SPA route
      // transitions by default — without this, the global `scroll-behavior:
      // smooth` in tokens.css would make every navigation slide-scroll to
      // the top instead of jumping instantly, which is what visitors saw
      // pre-16. This attribute opts back into the old (and still correct
      // here) behavior. See
      // https://nextjs.org/docs/app/guides/upgrading/version-16#scroll-behavior-override
      data-scroll-behavior="smooth"
      className={`${vazirmatn.variable} ${inter.variable}`}
    >
      <body>
        <ThemeScript />
        <LocaleScript />
        <NextIntlClientProvider locale="fa" messages={faMessages} timeZone="Asia/Tehran">
          <AppProviders>
            <SkipLink />
            <AuthHydrator />
            <InteractionAnalytics />
            {children}
            <RouteAnnouncer />
            <Analytics />
            <AttributionCapture />
            <ServiceWorkerRegistrar />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
