import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { allRows } from '@/lib/mock/catalogData';
import { findSku, relatedRows, priceSeriesWithDates, getRows, getCategories, getBilletReference, getSubsMap } from '@/lib/server/catalog';
import { formatToman } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { productImage } from '@/lib/data/productImages';
import { getSetting, getVatRate, getStaleHideAfterDays } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { skuHasPublishedPrice } from '../../../_seo/indexability';
import { JsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { Container, Section } from '@/components/ui';
import { SkuDetail } from '@/components/catalog/SkuDetail';

type Params = { params: Promise<{ category: string; sub: string; sku: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub, sku } = await params;
  const row = await findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) {
    return buildMetadata({ title: 'محصول پیدا نشد', noindex: true });
  }
  // W25 audit fix: this said «برای هر کیلوگرم» for every SKU. 47 active SKUs
  // are priced per قطعه / کلاف / شاخه / برگ / متر مربع, so the snippet Google
  // shows for those pages stated the wrong denomination — the same class of
  // error `PriceBasis` was added to end. `priceBasisNoun` is the wording the
  // price tables already use, so the snippet and the page now agree.
  const basisNoun = priceBasisNoun(row.current.priceBasis ?? row.priceBasis, row.branchLengthM);
  const mill = row.factory ? ` کارخانه ${row.factory}` : '';
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
      title: `استعلام قیمت ${row.name}`,
      description: `${row.name}${mill} — قیمت امروز این کالا در آهن‌تایم اعلام نشده است. برای استعلام قیمت هر ${basisNoun}، وزن شاخه و زمان تحویل با کارشناس ما تماس بگیرید.`,
      path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
    });
  }
  return buildMetadata({
    title: `قیمت روز ${row.name}`,
    description: `قیمت روز ${row.name}${mill}: ${formatToman(row.current.price)} برای هر ${basisNoun}، همراه با نوسان، وزن شاخه و زمان تحویل در آهن‌تایم.`,
    path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
  });
}

export default async function SkuPage({ params }: Params) {
  const { category, sub, sku } = await params;

  // The URL must reflect the SKU's canonical category/sub — otherwise a SKU
  // would resolve under any path and create duplicate, crawlable 200s.
  const row = await findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) notFound();

  const [related, priceHistory, categoryRows, categories, billet, logisticsConfig, vatRate, staleHideAfterDays] =
    await Promise.all([
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

  const catName = categories.find((c) => c.slug === category)?.name ?? category;
  const categorySubs = (await getSubsMap())[category] ?? [];
  const subLabel = categorySubs.find((x) => x.slug === sub)?.name ?? sub;
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: catName, href: routes.category(category) },
    { label: subLabel, href: routes.subCategory(category, sub) },
    { label: row.name, href: routes.sku(category, sub, row.slug) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={productJsonLd({
          name: row.name,
          price: row.current.price,
          // W23 audit fix: a stale-hidden price is a `0` sentinel — must
          // never reach a `price: 0, InStock` structured-data claim (a
          // known Google Merchant policy violation, and simply false).
          priceHidden: row.current.priceHidden,
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
        <SkuDetail row={row} related={related} series={series} dates={dates} categoryRows={subCategoryRows} billet={billet} subLabel={subLabel} categorySubs={categorySubs} logisticsConfig={logisticsConfig} vatRate={vatRate} />
      </Section>
    </Container>
  );
}

/**
 * Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. `allRows`
 * is mock data: baking these produced 243 SKU pages of invented prices in the
 * image, which stale-while-revalidate then served to the first visitor after
 * every deploy.
 */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return allRows.map((r) => ({ category: r.categoryId, sub: r.subCategoryId, sku: r.slug }));
}
