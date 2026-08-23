import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { allRows } from '@/lib/mock/catalogData';
import { findSku, relatedRows, priceSeries, getRows, getCategories, getBilletReference, getSubsMap } from '@/lib/server/catalog';
import { formatToman, priceHiddenLabel } from '@/lib/utils/format';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { productImage } from '@/lib/data/productImages';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
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
  // W23 audit fix: a stale-hidden price is a `0` sentinel (catalogRepo.
  // toPriceRow) — was rendering literally as "۰ تومان" in the search-result
  // snippet Google shows for this page.
  const price = priceHiddenLabel(row.current) ?? formatToman(row.current.price);
  // W25 audit fix: this said «برای هر کیلوگرم» for every SKU. 47 active SKUs
  // are priced per قطعه / کلاف / شاخه / برگ / متر مربع, so the snippet Google
  // shows for those pages stated the wrong denomination — the same class of
  // error `PriceBasis` was added to end. `priceBasisNoun` is the wording the
  // price tables already use, so the snippet and the page now agree.
  const basisNoun = priceBasisNoun(row.current.priceBasis ?? row.priceBasis, row.branchLengthM);
  return buildMetadata({
    title: `قیمت روز ${row.name}`,
    description: `قیمت روز ${row.name}${row.factory ? ` کارخانه ${row.factory}` : ''}: ${price} برای هر ${basisNoun}، همراه با نوسان، وزن شاخه و زمان تحویل در آهن‌تایم.`,
    path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
  });
}

export default async function SkuPage({ params }: Params) {
  const { category, sub, sku } = await params;

  // The URL must reflect the SKU's canonical category/sub — otherwise a SKU
  // would resolve under any path and create duplicate, crawlable 200s.
  const row = await findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) notFound();

  const [related, series, categoryRows, categories, billet, logisticsConfig, vatRate] = await Promise.all([
    relatedRows(row),
    priceSeries(row.slug, row.current.price),
    getRows(category),
    getCategories(),
    getBilletReference(),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
  ]);

  // W25 audit fix: the «مقایسهٔ کارخانه‌ها» panel is about THIS product, so it
  // is given this product's own sub-category rows — not the whole category's.
  // Passing the category meant a وال‌پست page shipped a payload dominated by
  // نبشی / ناودانی rows and opened the comparison on «نبشی» (the sub-category
  // the most mills quote), silently answering a question about a different
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
          available: row.isActive,
          url: routes.sku(row.categoryId, row.subCategoryId, row.slug),
          image: row.imageUrl ?? productImage(row.categoryId),
          brand: row.factory,
          sku: row.slug,
        })}
      />
      <Section space={10}>
        <SkuDetail row={row} related={related} series={series} categoryRows={subCategoryRows} billet={billet} subLabel={subLabel} categorySubs={categorySubs} logisticsConfig={logisticsConfig} vatRate={vatRate} />
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
