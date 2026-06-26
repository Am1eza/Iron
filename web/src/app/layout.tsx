import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/lib/providers/AppProviders';
import { AuthHydrator } from '@/lib/providers/AuthHydrator';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getSession } from '@/lib/auth/session';
import { getCategories } from '@/lib/data/catalog';
import { Ticker } from '@/components/layout/Ticker';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BottomTabBar } from '@/components/layout/BottomTabBar';
import { MobileDrawer } from '@/components/layout/MobileDrawer';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [categories, session] = await Promise.all([getCategories(), getSession()]);
  const initialUser = session
    ? {
        id: session.id,
        mobile: session.mobile,
        name: session.name,
        role: session.role,
      }
    : null;
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <a href="#main" className="skip-link">
          پرش به محتوا
        </a>
        <AppProviders>
          <AuthHydrator initialUser={initialUser} />
          <Ticker />
          <Header categories={categories} />
          <MobileDrawer categories={categories} />
          <main id="main">{children}</main>
          <Footer categories={categories} />
          <BottomTabBar />
        </AppProviders>
      </body>
    </html>
  );
}
