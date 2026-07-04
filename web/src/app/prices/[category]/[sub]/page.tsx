import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';
import { subName } from '@/lib/mock/catalogData';
import { getRows, getSubRows } from '@/lib/server/catalog';
import { CATEGORY_SUBS } from '@/lib/data/nav';
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

/** Pre-render the real (category, sub) pairs; unknown combos 404 on demand. */
export function generateStaticParams() {
  return categories
    .filter((c) => c.isActive)
    .flatMap((c) => (CATEGORY_SUBS[c.slug] ?? []).map((s) => ({ category: c.slug, sub: s.slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub } = await params;
  const cat = categories.find((c) => c.slug === category);
  const name = subName(category, sub);
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

  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const subs = CATEGORY_SUBS[category] ?? [];
  const name = subName(category, sub);
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
          data={rows.map((r) =>
            productJsonLd({
              name: r.name,
              price: r.current.price,
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            }),
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
              <BulkQuote category={category} categoryName={cat.name} rows={allRows} />
            </>
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
