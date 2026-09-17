import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BRAND_BY_LOCALE, OG_LOCALE } from '@/lib/seo';
import { routing } from '@/i18n/routing';
import { SiteChromeTop, SiteChromeBottom } from '@/components/layout/SiteChrome';
import { getCategories, getSubsMap, type SubsMap } from '@/lib/data/catalog';
import { getContact } from '@/lib/server/contact';
import { listMarketValues } from '@/lib/server/repos/marketRepo';
import { hasDb } from '@/lib/server/db/client';
import type { Category, MarketValue } from '@/lib/types/domain';

/**
 * The public storefront's own layout — nested inside the true root
 * (`app/layout.tsx`), which owns `<html><body>` and everything shared with
 * `/admin` (see that file's header comment for the full split rationale).
 * Everything HERE is public-site-specific: the ticker/header/footer chrome
 * and the locale-correct `NextIntlClientProvider`.
 *
 * `generateStaticParams` below is what lets every one of the ~250
 * catalog/blog/tool pages under this segment still prerender per locale at
 * build time — the whole reason this migration is safe for ISR, not a
 * regression of it: each locale gets its OWN static HTML with the real
 * translated text already in it, not a client-side swap after the fact.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The per-locale defaults every public page inherits: the brand suffix
 * template, the fallback title/description and `og:locale`. The root layout
 * (`app/layout.tsx`) is shared with the Persian-only panel, so its template is
 * Persian; without this override an /en page's title read «… | آهن‌تایم».
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  const brand = BRAND_BY_LOCALE[locale];
  return {
    title: { default: t('title'), template: `%s | ${brand}` },
    description: t('description'),
    applicationName: brand,
    openGraph: { type: 'website', siteName: brand, locale: OG_LOCALE[locale] },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Tells next-intl's server APIs (useTranslations, etc. called from a
  // Server Component under this tree) which locale to resolve WITHOUT
  // needing next/headers — required for this segment to stay statically
  // prerenderable per `generateStaticParams` above.
  setRequestLocale(locale);

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  // The image build deliberately has no database — render an honest empty
  // catalog rather than freezing development fixtures into the year-long
  // cached shell; SiteChrome hydrates it from /api/categories at runtime.
  // Dynamic renders with a DB still get complete SSR navigation. Mirrors the
  // exact fetch this root layout always did before the locale split.
  const dbReady = hasDb();
  const [[categories, subs], contact, initialMarketValues]: [
    [Category[], SubsMap],
    Awaited<ReturnType<typeof getContact>>,
    MarketValue[] | undefined,
  ] = await Promise.all([
    dbReady
      ? Promise.all([getCategories(), getSubsMap()])
      : Promise.resolve([[], {}] as [Category[], SubsMap]),
    getContact(),
    dbReady ? listMarketValues().catch(() => undefined) : Promise.resolve(undefined),
  ]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tehran">
      <SiteChromeTop
        categories={categories}
        subs={subs}
        initialMarketValues={initialMarketValues}
      />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteChromeBottom categories={categories} contact={contact} />
    </NextIntlClientProvider>
  );
}
