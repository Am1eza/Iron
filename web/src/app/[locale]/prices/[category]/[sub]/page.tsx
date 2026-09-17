import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getRows, getSubRows, getFactoryOrder } from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { factoryIsMeaningful, subCategorySubject } from '@/lib/utils/catalogLabels';
import { getLocalizedName, getLocalizedSkuName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { localizeDigits } from '@/lib/utils/format';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { taxonomyIsIndexable } from '../../_seo/indexability';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { EmptyCategoryState } from '@/components/catalog/EmptyCategoryState';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { BulkQuote } from '@/components/catalog/BulkQuote';

type Params = {
  params: Promise<{ category: string; sub: string; locale: string }>;
};

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub, locale } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  const subEntity = ((await getSubsMap())[category] ?? []).find((x) => x.slug === sub);
  const name = subEntity ? getLocalizedName(subEntity, locale as AppLocale) : undefined;
  if (!cat || !name) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('page'), noindex: true });
  }
  // «میلگرد آجدار», not «میلگرد آجدار میلگرد» — see subCategorySubject.
  const subject = subCategorySubject(name, getLocalizedName(cat, locale as AppLocale));
  const tMeta = await getTranslations({ locale, namespace: 'pricesFacet' });
  // SEO audit: every sub-category page previously shared one identical meta
  // description template with only `subject` swapped in, giving a searcher no
  // page-specific signal to judge relevance from. `getSubRows` is the same
  // query the page body already runs, so this is one extra call, not a new
  // data source. Factory count only counts rows that actually publish one —
  // several families (see `factoryIsMeaningful`) withhold it by design, and
  // a description bragging «۰ کارخانه» would read as broken.
  const rows = await getSubRows(category, sub);
  // A sub-category with no rows publishes no table, so it may neither promise
  // one nor be indexed — the rule, and the 17 production pages that were
  // doing both, are in `_seo/indexability.ts`. The branch removed from
  // `description` below IS the soft-404 the audit caught: «جدول قیمت روز مش
  // استنلس استیل با نوسان، وزن شاخه، استاندارد و زمان تحویل» shipped on a
  // zero-row page. `path` is still passed so the canonical stays
  // self-referential; a noindex page whose canonical points elsewhere sends
  // two contradictory instructions about the same URL.
  if (!taxonomyIsIndexable(rows.length)) {
    return buildMetadata({
    locale,
      title: subject,
      description: tMeta('emptySubjectDescription', { subject }),
      path: routes.subCategory(category, sub),
      noindex: true,
    });
  }
  const factoryCount = new Set(rows.map((r) => r.factory).filter((f): f is string => Boolean(f)))
    .size;
  const stats =
    factoryCount > 0
      ? tMeta('statsWithFactories', {
          products: localizeDigits(rows.length, locale),
          factories: localizeDigits(factoryCount, locale),
        })
      : tMeta('statsOnly', { products: localizeDigits(rows.length, locale) });
  return buildMetadata({
    locale,
    title: tMeta('todayPrice', { subject }),
    description: tMeta('tableDescription', { subject, stats }),
    path: routes.subCategory(category, sub),
  });
}

export default async function SubCategoryPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const tFacet = await getTranslations({ locale: pageLocale, namespace: 'pricesFacet' });
  const { category, sub, locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;

  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const subs = (await getSubsMap())[category] ?? [];
  const subEntity = subs.find((x) => x.slug === sub);
  if (!subEntity) notFound();
  const name = getLocalizedName(subEntity, locale);
  const catName = getLocalizedName(cat, locale);

  const [rows, allRows, logisticsConfig, vatRate, factoryOrder] = await Promise.all([
    getSubRows(category, sub),
    getRows(category),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
    // Per CATEGORY, not per sub-category — this page renders the category's
    // whole table filtered to one sub, so it needs the same order the
    // category page uses (US-18.2).
    getFactoryOrder(category),
  ]);

  // The one subject line the title, the H1 and the intro all spell — kept
  // identical on purpose, so a page can never advertise itself two ways.
  const subject = subCategorySubject(name, catName);

  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('nav.prices'), href: routes.prices() },
    { label: catName, href: routes.category(category) },
    { label: name, href: routes.subCategory(category, sub) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {rows.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            rows.map((r) => ({
              name: getLocalizedSkuName(r, cat, subEntity, locale),
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            })),
          )}
        />
      )}

      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            {/* The H1 and the intro follow the same rule the metadata does:
                with no rows there is no price list, so the page must not
                announce one. Saying «قیمت لحظه‌ای … به تفکیک سایز و کارخانه»
                above an EmptyState is the on-page half of the soft-404 —
                what a crawler reads and what a visitor reads have to agree. */}
            <PriceHeader
              categorySlug={category}
              categoryName={cat.name}
              id="sub-title"
              title={rows.length > 0 ? tFacet('todayPrice', { subject }) : subject}
              description={
                rows.length > 0
                  ? tFacet('subLiveDescription', {
                      subject,
                      breakdown: factoryIsMeaningful(category, sub)
                        ? tFacet('breakdownBySizeAndMill')
                        : tFacet('breakdownBySize'),
                    })
                  : tFacet('subEmptyBody', { subject })
              }
            />
          </div>

          {rows.length > 0 ? (
            <>
              <PriceTable
                rows={allRows}
                subs={subs}
                category={cat}
                categorySlug={category}
                initialSub={sub}
                vatRate={vatRate}
                factoryOrder={factoryOrder}
              />
              <BulkQuote
                category={category}
                categoryName={cat.name}
                categoryEntity={cat}
                rows={allRows}
                subs={subs}
                logisticsConfig={logisticsConfig}
                vatRate={vatRate}
              />
            </>
          ) : (
            <EmptyCategoryState />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
