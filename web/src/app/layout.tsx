import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers/AppProviders';

/**
 * Root layout — the RTL, Persian-first shell.
 * <html lang="fa" dir="rtl"> + design tokens (via globals.css).
 * Fonts are self-hosted via @font-face in tokens.css (add the .woff2 files to /public/fonts).
 */

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://poladin.com'),
  title: {
    default: 'پولادین — بازار هوشمند آهن و فولاد',
    template: '%s | پولادین',
  },
  description:
    'پولادین، بازار هوشمند آهن و فولاد: مشاور هوش مصنوعی، قیمت‌های شفاف و لحظه‌ای و زمان تحویل تضمینی. اول مشورت، بعد خرید.',
  applicationName: 'پولادین',
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'پولادین',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#171C22',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <a href="#main" className="skip-link">
          پرش به محتوا
        </a>
        <AppProviders>
          <main id="main">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
