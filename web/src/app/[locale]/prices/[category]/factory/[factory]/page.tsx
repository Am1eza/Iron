import type { Metadata } from 'next';
import { getLocalizedName, getLocalizedSkuName, getLocalizedMeasure } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  getCategories,
  getCategoryFacets,
  getRowsByFactory,
  getFactoryOrder,
} from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { sizeLabel } from '@/lib/utils/catalogLabels';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { FacetRail } from '@/components/catalog/FacetRail';

type Params = { params: Promise<{ category: string; factory: string; locale: string }> };

// Same cadence as the category and sub-category pages one level up — this is
// the same admin-entered price data, filtered.
export const revalidate = 300;

/**
 * «قیمت میلگرد اصفهان» — one crawlable page per (category × factory).
 *
 * No `generateStaticParams`: unlike `[category]`/`[sub]`, the valid segments
 * here are not a taxonomy the fixtures know about — they are derived from
 * `skus.factory`, a free-text column, so a build with no `DATABASE_URL` (which
 * is every CI build here) could only invent them. Rendered on demand and
 * ISR-cached instead.
 *
 * A factory with zero rows in this category is `notFound()`, not an empty
 * page: a thin, product-less landing page is worse for the ranking these pages
 * exist to win than no page at all. Middleware turns that into a real 404 —
 * `notFound()` alone replies 200 in this Next version (see
 * `lib/server/seo/knownPaths.ts`), and `publicCatalogPaths` is what tells it
 * which of these URLs are real.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, factory, locale } = await params;
  const [categories, facets] = await Promise.all([getCategories(), getCategoryFacets(category)]);
  const cat = categories.find((c) => c.slug === category);
  const facet = facets.factories.find((f) => f.slug === factory);
  const tMeta = await getTranslations({ locale, namespace: 'pricesFacet' });
  if (!cat || !facet) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('page'), noindex: true });
  }
  const catName = getLocalizedName(cat, locale as AppLocale);
  return buildMetadata({
    locale,
    title: tMeta('factoryPageTitle', { category: catName, factory: facet.label }),
    description: tMeta('factoryPageDescriptionFull', {
      category: catName,
      factory: facet.label,
      measure: getLocalizedMeasure(sizeLabel(category), locale as AppLocale),
    }),
    path: routes.categoryByFactory(category, factory),
  });
}

export default async function FactoryLandingPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const tFacet = await getTranslations({ locale: pageLocale, namespace: 'pricesFacet' });
  const { category, factory, locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;

  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const [facets, rows, subs, vatRate, factoryOrder, logisticsConfig] = await Promise.all([
    getCategoryFacets(category),
    getRowsByFactory(category, factory),
    getSubsMap().then((m) => m[category] ?? []),
    getVatRate(),
    getFactoryOrder(category),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
  ]);

  const facet = facets.factories.find((f) => f.slug === factory);
  // `rows.length === 0` is the same condition as `!facet` (both are derived
  // from the same getRows call) — checked separately so the page can never
  // render a table it has no rows for even if that ever stops being true.
  if (!facet || rows.length === 0) notFound();

  const catName = getLocalizedName(cat, locale);
  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('nav.prices'), href: routes.prices() },
    { label: catName, href: routes.category(category) },
    { label: facet.label, href: routes.categoryByFactory(category, factory) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={itemListJsonLd(
          rows.map((r) => ({
            name: getLocalizedSkuName(r, cat, subs.find((x) => x.slug === r.subCategoryId), locale),
            url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
          })),
        )}
      />

      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <PriceHeader
              categorySlug={category}
              categoryName={cat.name}
              id="factory-title"
              title={tFacet('factoryPageTitle', { category: catName, factory: facet.label })}
              description={tFacet('factorySectionDescription', {
                category: catName,
                factory: facet.label,
                measure: getLocalizedMeasure(sizeLabel(category), locale),
              })}
            />
          </div>

          <PriceTable
            rows={rows}
            subs={subs}
            category={cat}
            categorySlug={category}
            vatRate={vatRate}
            factoryOrder={factoryOrder}
          />
          <BulkQuote
            category={category}
            categoryName={cat.name}
            categoryEntity={cat}
            rows={rows}
            subs={subs}
            logisticsConfig={logisticsConfig}
            vatRate={vatRate}
          />

          <FacetRail
            id="rail-sizes"
            title={tFacet('sizesOfTitle', { category: cat.name, measure: sizeLabel(category) })}
            facets={facets.sizes}
            href={(slug) => routes.categoryBySize(category, slug)}
          />
          <FacetRail
            id="rail-factories"
            title={tFacet('otherFactoriesTitle', { category: cat.name })}
            facets={facets.factories}
            activeSlug={facet.slug}
            href={(slug) => routes.categoryByFactory(category, slug)}
          />
        </Stack>
      </Section>
    </Container>
  );
}
