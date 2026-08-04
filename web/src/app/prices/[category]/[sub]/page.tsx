import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories as mockCategories } from '@/lib/mock/fixtures';
import { getCategories, getRows, getSubRows } from '@/lib/server/catalog';
import { MOCK_CATEGORY_SUBS } from '@/lib/data/nav';
import { getSubsMap } from '@/lib/data/catalog';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { Container, Section, Stack, Breadcrumbs, EmptyState, emptyPresets } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { BulkQuote } from '@/components/catalog/BulkQuote';

type Params = {
  params: Promise<{ category: string; sub: string }>;
};

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

/**
 * Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. These pairs
 * come from `MOCK_CATEGORY_SUBS`, which is a mock/seed fixture and no longer matches
 * the live taxonomy in either direction, so prerendering from it baked pages
 * for sub-categories that do not exist and none for the ones that do.
 */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return mockCategories
    .filter((c) => c.isActive)
    .flatMap((c) => (MOCK_CATEGORY_SUBS[c.slug] ?? []).map((s) => ({ category: c.slug, sub: s.slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  const name = ((await getSubsMap())[category] ?? []).find((x) => x.slug === sub)?.name;
  if (!cat || !name) {
    return buildMetadata({ title: 'صفحه پیدا نشد', noindex: true });
  }
  return buildMetadata({
    title: `قیمت روز ${name} ${cat.name}`,
    description: `جدول قیمت روز ${name} ${cat.name} با نوسان، وزن شاخه، استاندارد و زمان تحویل در آهن‌تایم. اول مشورت، بعد خرید.`,
    path: routes.subCategory(category, sub),
  });
}

export default async function SubCategoryPage({ params }: Params) {
  const { category, sub } = await params;

  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const subs = (await getSubsMap())[category] ?? [];
  const name = subs.find((x) => x.slug === sub)?.name;
  if (!name) notFound();

  const [rows, allRows] = await Promise.all([getSubRows(category, sub), getRows(category)]);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: cat.name, href: routes.category(category) },
    { label: name },
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
              id="sub-title"
              title={`قیمت روز ${name} ${cat.name}`}
              description={`قیمت لحظه‌ای ${name} ${cat.name} به تفکیک سایز و کارخانه، همراه با نوسان، وزن شاخه و زمان تحویل اعلام‌شده. پیش از خرید، با کارشناس ما مشورت کنید.`}
            />
          </div>

          {rows.length > 0 ? (
            <>
              <PriceTable rows={allRows} subs={subs} categoryName={cat.name} initialSub={sub} />
              <BulkQuote category={category} categoryName={cat.name} rows={allRows} subs={subs} />
            </>
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
