import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories as mockCategories } from '@/lib/mock/fixtures';
import { getCategories, getRows } from '@/lib/server/catalog';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import {
  Container,
  Section,
  Stack,
  Breadcrumbs,
  EmptyState,
  emptyPresets,
} from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { PriceHeader } from '@/components/catalog/PriceHeader';

type Params = { params: Promise<{ category: string }> };

export function generateStaticParams() {
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
  const subs = CATEGORY_SUBS[category] ?? [];

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
              <PriceTable rows={rows} subs={subs} categoryName={cat.name} />
              <BulkQuote category={category} categoryName={cat.name} rows={rows} />
            </>
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
