import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getCategoryFacets, getRowsByFactory, getFactoryOrder } from '@/lib/server/catalog';
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

type Params = { params: Promise<{ category: string; factory: string }> };

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
  const { category, factory } = await params;
  const [categories, facets] = await Promise.all([getCategories(), getCategoryFacets(category)]);
  const cat = categories.find((c) => c.slug === category);
  const facet = facets.factories.find((f) => f.slug === factory);
  if (!cat || !facet) return buildMetadata({ title: 'صفحه پیدا نشد', noindex: true });
  return buildMetadata({
    title: `قیمت روز ${cat.name} ${facet.label}`,
    description: `قیمت امروز ${cat.name} ${facet.label} به تفکیک ${sizeLabel(category)}، همراه با نوسان، وزن شاخه و زمان تحویل. قیمت‌ها لحظه‌ای و اعلام‌شده توسط آهن‌تایم است. اول مشورت، بعد خرید.`,
    path: routes.categoryByFactory(category, factory),
  });
}

export default async function FactoryLandingPage({ params }: Params) {
  const { category, factory } = await params;

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

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: cat.name, href: routes.category(category) },
    { label: facet.label, href: routes.categoryByFactory(category, factory) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd
        data={itemListJsonLd(
          rows.map((r) => ({ name: r.name, url: routes.sku(r.categoryId, r.subCategoryId, r.slug) })),
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
              title={`قیمت روز ${cat.name} ${facet.label}`}
              description={`قیمت لحظه‌ای تمام ${cat.name}‌های تولید ${facet.label} به تفکیک ${sizeLabel(category)}، همراه با نوسان، وزن شاخه و زمان تحویل اعلام‌شده. پیش از خرید، با کارشناس ما مشورت کنید.`}
            />
          </div>

          <PriceTable
            rows={rows}
            subs={subs}
            categoryName={cat.name}
            categorySlug={category}
            vatRate={vatRate}
            factoryOrder={factoryOrder}
          />
          <BulkQuote
            category={category}
            categoryName={cat.name}
            rows={rows}
            subs={subs}
            logisticsConfig={logisticsConfig}
            vatRate={vatRate}
          />

          <FacetRail
            id="rail-sizes"
            title={`${sizeLabel(category)}‌های ${cat.name}`}
            facets={facets.sizes}
            href={(slug) => routes.categoryBySize(category, slug)}
          />
          <FacetRail
            id="rail-factories"
            title={`سایر کارخانه‌های ${cat.name}`}
            facets={facets.factories}
            activeSlug={facet.slug}
            href={(slug) => routes.categoryByFactory(category, slug)}
          />
        </Stack>
      </Section>
    </Container>
  );
}
