import { localizeDigits } from '@/lib/utils/format';
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
  getRowsBySize,
  getFactoryOrder,
} from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { sizeLabel, factoryIsMeaningful } from '@/lib/utils/catalogLabels';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { FacetRail } from '@/components/catalog/FacetRail';

type Params = { params: Promise<{ category: string; size: string; locale: string }> };

export const revalidate = 300;

/**
 * «قیمت میلگرد ۱۴» — one crawlable page per (category × size), the sibling of
 * the factory landing page. Same reasoning throughout; see that file's header
 * for why there is no `generateStaticParams` and why an empty facet 404s.
 *
 * The heading says «ضخامت» for ورق and «سایز» everywhere else, via the same
 * `sizeLabel` the price table's own column header uses — ورق is measured in
 * millimetres of thickness and the trade never calls that a size, so a page
 * titled «قیمت ورق سایز ۳» would read as wrong to the exact buyer it targets.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, size, locale } = await params;
  const [categories, facets] = await Promise.all([getCategories(), getCategoryFacets(category)]);
  const cat = categories.find((c) => c.slug === category);
  const facet = facets.sizes.find((f) => f.slug === size);
  if (!cat || !facet) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('page'), noindex: true });
  }
  const measure = getLocalizedMeasure(sizeLabel(category), locale as AppLocale);
  const catName = getLocalizedName(cat, locale as AppLocale);
  // «به تفکیک کارخانه» only where a mill name is actually published — on
  // استیل (imported, no mill at all) the page has no factory column, no
  // factory sections and no factory rail, so promising one in the search
  // snippet describes a page that does not exist. Same conditional the
  // sub-category page uses (catalogLabels.factoryIsMeaningful); asked at the
  // CATEGORY level because this page mixes every sub-category of one size.
  const tMeta = await getTranslations({ locale, namespace: 'pricesFacet' });
  const byFactory = factoryIsMeaningful(category, null);
  return buildMetadata({
    locale,
    title: tMeta('sizePageTitle', { category: catName, measure, size: localizeDigits(facet.label, locale) }),
    description: tMeta('sizePageDescription', {
      category: catName,
      measure,
      factory: facet.label,
      byFactory: byFactory ? tMeta('byFactorySuffix') : '',
    }),
    path: routes.categoryBySize(category, size),
  });
}

export default async function SizeLandingPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const tFacet = await getTranslations({ locale: pageLocale, namespace: 'pricesFacet' });
  const { category, size, locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;

  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const [facets, rows, subs, vatRate, factoryOrder, logisticsConfig] = await Promise.all([
    getCategoryFacets(category),
    getRowsBySize(category, size),
    getSubsMap().then((m) => m[category] ?? []),
    getVatRate(),
    getFactoryOrder(category),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
  ]);

  const facet = facets.sizes.find((f) => f.slug === size);
  if (!facet || rows.length === 0) notFound();

  const measure = getLocalizedMeasure(sizeLabel(category), locale);
  const catName = getLocalizedName(cat, locale);
  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('nav.prices'), href: routes.prices() },
    { label: catName, href: routes.category(category) },
    { label: `${measure} ${localizeDigits(facet.label, locale)}`, href: routes.categoryBySize(category, size) },
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
              id="size-title"
              title={tFacet('sizePageTitle', { category: catName, measure, size: localizeDigits(facet.label, locale) })}
              description={tFacet('sizeSectionDescription', {
                category: catName,
                measure,
                size: facet.label,
                allMills: factoryIsMeaningful(category, null) ? tFacet('allMillsSuffix') : '',
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
            kind="size"
            title={tFacet('otherSizesTitle', { category: cat.name, measure })}
            facets={facets.sizes}
            activeSlug={facet.slug}
            href={(slug) => routes.categoryBySize(category, slug)}
          />
          <FacetRail
            id="rail-factories"
            kind="factory"
            title={tFacet('factoriesTitle', { category: cat.name })}
            facets={facets.factories}
            href={(slug) => routes.categoryByFactory(category, slug)}
          />
        </Stack>
      </Section>
    </Container>
  );
}
