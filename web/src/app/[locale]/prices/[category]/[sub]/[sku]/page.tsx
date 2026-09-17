import type { Metadata } from 'next';
import { getLocalizedName, getLocalizedSkuName, getLocalizedBasisNoun } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  findSku,
  relatedRows,
  priceSeriesWithDates,
  getRows,
  getCategories,
  getBilletReference,
  getSubsMap,
} from '@/lib/server/catalog';
import { formatToman } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { productImage } from '@/lib/data/productImages';
import { getSetting, getVatRate, getStaleHideAfterDays } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { skuHasPublishedPrice } from '../../../_seo/indexability';
import { JsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { Container, Section } from '@/components/ui';
import { SkuDetail } from '@/components/catalog/SkuDetail';

type Params = { params: Promise<{ category: string; sub: string; sku: string; locale: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub, sku, locale } = await params;
  const row = await findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) {
    const t = await getTranslations({ locale, namespace: 'meta.notFound' });
    return buildMetadata({ locale, title: t('product'), noindex: true });
  }
  // W25 audit fix: this said «برای هر کیلوگرم» for every SKU. 47 active SKUs
  // are priced per قطعه / کلاف / شاخه / برگ / متر مربع, so the snippet Google
  // shows for those pages stated the wrong denomination — the same class of
  // error `PriceBasis` was added to end. `priceBasisNoun` is the wording the
  // price tables already use, so the snippet and the page now agree.
  const appLocale = locale as AppLocale;
  const basis = row.current.priceBasis ?? row.priceBasis;
  const basisNoun =
    appLocale === 'fa' ? priceBasisNoun(basis, row.branchLengthM) : getLocalizedBasisNoun(basis, appLocale);
  const tMeta = await getTranslations({ locale, namespace: 'pricesFacet' });
  const mill = row.factory ? (appLocale === 'fa' ? ` کارخانه ${row.factory}` : ` (${row.factory})`) : '';
  const [metaCategories, metaSubs] = await Promise.all([getCategories(), getSubsMap()]);
  const subject = getLocalizedSkuName(
    row,
    metaCategories.find((c) => c.slug === category),
    (metaSubs[category] ?? []).find((x) => x.slug === sub),
    appLocale,
  );
  // 195 of 748 product pages (26 %, measured on production 1405/06/09)
  // publish no price. They shipped a title announcing «قیمت روز تیرآهن هاش
  // سنگین (HEB) ۲۴» over a description that then read «… : تماس بگیرید برای
  // هر کیلوگرم» — a headline promising a number, a snippet admitting there
  // is none, and a click that bounces. `priceHidden` covers both causes
  // (never priced, or aged past the freshness SLA) because the page cannot
  // tell them apart and neither can the searcher.
  //
  // These pages stay INDEXED — see `_seo/indexability.ts` for why that is
  // not symmetric with the empty-taxonomy rule. Only the claim changes. The
  // JSON-LD below already drops `offers` entirely on this branch, which is
  // the correct structured-data representation and needs no change: a
  // Product with no Offer is valid schema, a `price: 0` Offer is a Merchant
  // Center policy violation.
  if (!skuHasPublishedPrice(row)) {
    return buildMetadata({
    locale,
      title: tMeta('skuQuoteTitle', { subject }),
      description: tMeta('skuQuoteDescription', { subject, mill, unit: basisNoun }),
      path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
    });
  }
  return buildMetadata({
    locale,
    title: tMeta('todayPrice', { subject }),
    description: tMeta('skuPriceDescription', {
      subject,
      mill,
      price:
        appLocale === 'fa'
          ? formatToman(row.current.price)
          : `${formatToman(row.current.price, true, locale)} ${(await getTranslations({ locale, namespace: 'common.unit' }))('currency')}`,
      unit: basisNoun,
    }),
    path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
  });
}

export default async function SkuPage({ params }: Params) {
  // Must run before any next-intl server call below: without it this page's
  // body resolved every translation in Persian on /en, /ar and /zh.
  const pageLocale = (await params).locale;
  setRequestLocale(pageLocale);
  const tNav = await getTranslations({ locale: pageLocale });
  const { category, sub, sku, locale: rawLocale } = await params;
  const locale = rawLocale as AppLocale;

  // The URL must reflect the SKU's canonical category/sub — otherwise a SKU
  // would resolve under any path and create duplicate, crawlable 200s.
  const row = await findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) notFound();

  const [
    related,
    priceHistory,
    categoryRows,
    categories,
    billet,
    logisticsConfig,
    vatRate,
    staleHideAfterDays,
  ] = await Promise.all([
    relatedRows(row),
    priceSeriesWithDates(row.slug, row.current.price),
    getRows(category),
    getCategories(),
    getBilletReference(),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
    getStaleHideAfterDays(),
  ]);
  const { series, dates } = priceHistory;

  // W25 audit fix: the comparison panel is about THIS product, so it
  // is given this product's own sub-category rows, not the whole category's.
  // Passing the category meant a wal-post page shipped a payload dominated by
  // other sub-category rows and opened the comparison on the sub-category the
  // most mills quote, silently answering a question about a different
  // product. Narrowing here also keeps the client payload to the rows the
  // panel can actually use.
  const subCategoryRows = categoryRows.filter((r) => r.subCategoryId === sub);

  const cat = categories.find((c) => c.slug === category);
  const catName = cat ? getLocalizedName(cat, locale) : category;
  const categorySubs = (await getSubsMap())[category] ?? [];
  const subEntity = categorySubs.find((x) => x.slug === sub);
  const subLabel = subEntity ? getLocalizedName(subEntity, locale) : sub;
  const skuName = getLocalizedSkuName(row, cat, subEntity, locale);
  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('nav.prices'), href: routes.prices() },
    { label: catName, href: routes.category(category) },
    { label: subLabel, href: routes.subCategory(category, sub) },
    { label: skuName, href: routes.sku(category, sub, row.slug) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={productJsonLd({
          name: skuName,
          price: row.current.price,
          // W23 audit fix: a stale-hidden price is a `0` sentinel — must
          // never reach a `price: 0, InStock` structured-data claim (a
          // known Google Merchant policy violation, and simply false).
          priceHidden: row.current.priceHidden || row.current.priceIsEstimated,
          priceBasis: row.current.priceBasis ?? row.priceBasis,
          // Validity runs from when the price was SET, bounded by the same
          // freshness SLA that withholds it — not from render time. See
          // `offerValidUntil`. `available` is deliberately not passed: nothing
          // tracks stock, and `isActive` only means "published".
          priceUpdatedAt: row.current.updatedAt,
          priceValidityDays: staleHideAfterDays,
          url: routes.sku(row.categoryId, row.subCategoryId, row.slug),
          image: row.imageUrl ?? productImage(row.categoryId),
          brand: row.factory,
          sku: row.slug,
        })}
      />
      <Section space={10}>
        <SkuDetail
          row={row}
          category={cat}
          related={related}
          series={series}
          dates={dates}
          categoryRows={subCategoryRows}
          billet={billet}
          subLabel={subLabel}
          categorySubs={categorySubs}
          logisticsConfig={logisticsConfig}
          vatRate={vatRate}
        />
      </Section>
    </Container>
  );
}

// No `generateStaticParams` here (deliberately, not an oversight): under the
// `[locale]` segment, an empty return combined with the parent's non-empty
// locale params makes Next's on-demand ISR fallback throw
// `DYNAMIC_SERVER_USAGE` for every request — this route 500'd in production
// live (2026-09-14) until this was removed. Omitting the export entirely
// keeps the route plain server-rendered per request instead; `revalidate`
// above no longer applies HTML caching, only request-level dedup.
