import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getRows, getFactoryOrder } from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { taxonomyIsIndexable } from '../_seo/indexability';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { EmptyCategoryState } from '@/components/catalog/EmptyCategoryState';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { PriceFaq, PriceUpdatedAt } from '@/components/catalog/PriceFaq';
import { priceFacts } from '@/lib/seo/priceFacts';
import { FacetRail } from '@/components/catalog/FacetRail';
import { factoryFacets, sizeFacets } from '@/lib/utils/catalogFacets';
import { sizeLabel } from '@/lib/utils/catalogLabels';
import { getLocalizedName, getLocalizedSkuName, getLocalizedMeasure } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';

type Params = { params: Promise<{ category: string; locale: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6),
// matching the [sub] and [sku] pages one level down.
export const revalidate = 300;

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, locale } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('category'), noindex: true });
  }
  const name = getLocalizedName(cat, locale as AppLocale);
  const tMeta = await getTranslations({ locale, namespace: 'pricesFacet' });
  // Same rule as the sub-category one level down (`_seo/indexability.ts`): a
  // category with no rows renders an EmptyState, so it must not be indexed
  // promising a price list. No category is in that state today — the audit
  // found the 17 empties one level down — but the panel creates a category
  // before anything is filed under it, and that window is exactly when
  // Googlebot is most likely to arrive from the mega-menu link.
  //
  // The extra `getRows` costs one query on a page that already runs it:
  // `getRows` is not memoised across generateMetadata and the render, which
  // is the same trade the [sub] page already makes for its own description.
  const rows = await getRows(category);
  if (!taxonomyIsIndexable(rows.length)) {
    return buildMetadata({
    locale,
      title: name,
      description: tMeta('emptyCategoryDescription', { subject: name }),
      path: routes.category(category),
      noindex: true,
    });
  }
  return buildMetadata({
    locale,
    title: tMeta('todayPrice', { subject: name }),
    description: tMeta('todayPriceDescription', { subject: name }),
    path: routes.category(category),
  });
}

export default async function CategoryPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const tFacet = await getTranslations({ locale: pageLocale, namespace: 'pricesFacet' });
  const { category, locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();
  // Every visible and structured-data NAME on this page in the page's locale
  // (falls back to fa where no translation is on file). `cat.name` itself is
  // still what goes into component props that match on it.
  const catName = getLocalizedName(cat, locale);

  const rows = await getRows(category);
  const subs = (await getSubsMap())[category] ?? [];
  // Built from `rows`, not re-queried — same list the facet landing pages
  // resolve their own URL against, so a rail link can never point at a page
  // that 404s.
  const facets = { factories: factoryFacets(rows), sizes: sizeFacets(rows) };
  const [logisticsConfig, vatRate, factoryOrder] = await Promise.all([
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
    // Admin-chosen order for the «بر اساس کارخانه» sections (US-18.2). Empty
    // until the admin arranges this category, which the table reads as "keep
    // sorting the way you did before".
    getFactoryOrder(category),
  ]);

  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('nav.prices'), href: routes.prices() },
    { label: catName, href: routes.category(category) },
  ];
  // Computed from the same `rows` the table renders — see priceFacts.
  const facts = priceFacts(rows);

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {rows.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            rows.map((r) => ({
              name: getLocalizedSkuName(r, cat, subs.find((x) => x.slug === r.subCategoryId), locale),
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            })),
          )}
        />
      )}

      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <PriceHeader
              categorySlug={category}
              categoryName={cat.name}
              id="cat-title"
              {...(rows.length > 0
                ? {
                    title: tFacet('todayPrice', { subject: catName }),
                    description: tFacet('liveDescription', { subject: catName }),
                  }
                : {
                    // Nothing to list — the heading and the intro say so, so
                    // the visible page and the (noindex) metadata tell one
                    // story. See `_seo/indexability.ts`.
                    title: catName,
                    description: tFacet('emptyCategoryBody', { subject: catName }),
                  })}
            />
            {facts?.latestAt && <PriceUpdatedAt iso={facts.latestAt} locale={locale} />}
          </div>

          {rows.length > 0 ? (
            <>
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
              {/* The internal link graph into the per-factory / per-size
                  landing pages. Without it those pages are reachable only from
                  sitemap.xml, which is a discovery hint, not a crawl path. */}
              <FacetRail
                id="rail-factories"
                title={tFacet('byFactoryTitle', { category: catName })}
                facets={facets.factories}
                href={(slug) => routes.categoryByFactory(category, slug)}
              />
              <FacetRail
                id="rail-sizes"
                title={tFacet('bySizeTitle', { category: catName, measure: getLocalizedMeasure(sizeLabel(category), locale) })}
                facets={facets.sizes}
                href={(slug) => routes.categoryBySize(category, slug)}
              />
              {facts && <PriceFaq facts={facts} subject={catName} locale={locale} vatRate={vatRate} />}
            </>
          ) : (
            <EmptyCategoryState />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
