import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { RouteAnnouncer } from '@/components/a11y/RouteAnnouncer';
import { SkipLink } from '@/components/a11y/SkipLink';
import { vazirmatn, inter } from '@/lib/theme/fonts';
import { getDirection, localeFromIntlHeader } from '@/i18n/config';
import { Analytics } from '@/components/analytics/Analytics';
import { AttributionCapture } from '@/components/analytics/AttributionCapture';
import { InteractionAnalytics } from '@/components/analytics/InteractionAnalytics';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import faMessages from '../../messages/fa.json';
import enMessages from '../../messages/en.json';
import arMessages from '../../messages/ar.json';
import zhMessages from '../../messages/zh.json';

const SKIP_LABELS = {
  fa: faMessages.common.skipToContent,
  en: enMessages.common.skipToContent,
  ar: arMessages.common.skipToContent,
  zh: zhMessages.common.skipToContent,
} as const;

/**
 * Root layout — the TRUE Next.js root (the one place `<html><body>` may
 * appear), shared by BOTH `/admin/*` (which never lives under `[locale]` —
 * the panel is Persian-only for staff) and the public `[locale]/*` tree.
 *
 * It sits ABOVE `[locale]` in the route tree, so it cannot read
 * `params.locale` (a parent layout renders before a child dynamic segment is
 * resolved). It reads `X-NEXT-INTL-LOCALE` instead — the request header
 * `proxy.ts` sets on every public HTML request (see `withIntlLocale` there)
 * — so `<html lang dir>` is correct IN THE FIRST BYTE for /en, /ar and /zh
 * rather than being patched by client JavaScript afterwards.
 *
 * That header read makes this layout dynamic, which costs nothing here: every
 * public page already rendered per request before it (the `next build` route
 * table listed every `[locale]` route as `ƒ Dynamic`, and prod answered every
 * HTML request with `cache-control: private, no-store` — both checked
 * 2026-09-18, before this change). The predecessor to this — an external
 * `beforeInteractive` script (`public/locale-init.js`) that flipped the two
 * attributes before paint — existed ONLY to work around the static Persian
 * shell, so it is deleted rather than left as a redundant blocking request in
 * `<head>`: a crawler that does not execute JavaScript (Bing, most
 * answer-engine fetchers) read `lang="fa"` on every /en page, which is
 * precisely the bug this replaces.
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
 * `<html lang dir>` (per request, see above) + design tokens (via
 * globals.css).
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // See `localeFromIntlHeader` for why this header and what an absent one
  // means. `headers()` is what makes this layout render per request.
  const locale = localeFromIntlHeader((await headers()).get('x-next-intl-locale'));
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
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
        <NextIntlClientProvider locale="fa" messages={faMessages} timeZone="Asia/Tehran">
          <AppProviders>
            <SkipLink label={SKIP_LABELS[locale]} />
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
