import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories as mockCategories } from '@/lib/mock/fixtures';
import { getCategories, getRows, getFactoryOrder } from '@/lib/server/catalog';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { Container, Section, Stack, Breadcrumbs, EmptyState, emptyPresets } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { PriceHeader } from '@/components/catalog/PriceHeader';

type Params = { params: Promise<{ category: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6),
// matching the [sub] and [sku] pages one level down.
export const revalidate = 300;

/** Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return mockCategories.filter((c) => c.isActive).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return buildMetadata({ title: 'دسته پیدا نشد', noindex: true });
  const name = cat.name;
  return buildMetadata({
    title: `قیمت روز ${name}`,
    description: `قیمت روز ${name} با نوسان، وزن شاخه و زمان تحویل در آهن‌تایم.`,
    path: routes.category(category),
  });
}

export default async function CategoryPage({ params }: Params) {
  const { category } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const rows = await getRows(category);
  const subs = (await getSubsMap())[category] ?? [];
  const [logisticsConfig, vatRate, factoryOrder] = await Promise.all([
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
    // Admin-chosen order for the «بر اساس کارخانه» sections (US-18.2). Empty
    // until the admin arranges this category, which the table reads as "keep
    // sorting the way you did before".
    getFactoryOrder(category),
  ]);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: cat.name },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {rows.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            rows.map((r) => ({
              name: r.name,
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
              title={`قیمت روز ${cat.name}`}
              description={`قیمت‌های لحظه‌ای ${cat.name} با نوسان، وزن شاخه و زمان تحویل اعلام‌شده. اول مشورت، بعد خرید.`}
            />
          </div>

          {rows.length > 0 ? (
            <>
              <PriceTable
                rows={rows}
                subs={subs}
                categoryName={cat.name}
                categorySlug={category}
                vatRate={vatRate}
                factoryOrder={factoryOrder}
              />
              <BulkQuote category={category} categoryName={cat.name} rows={rows} subs={subs} logisticsConfig={logisticsConfig} vatRate={vatRate} />
            </>
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
