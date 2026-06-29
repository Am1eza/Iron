import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';
import { findSku, subName } from '@/lib/mock/catalogData';
import { formatToman } from '@/lib/utils/format';
import { JsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { Container, Section } from '@/components/ui';
import { SkuDetail } from '@/components/catalog/SkuDetail';

type Params = { params: Promise<{ category: string; sub: string; sku: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub, sku } = await params;
  const row = findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) {
    return buildMetadata({ title: 'محصول پیدا نشد', noindex: true });
  }
  const price = formatToman(row.current.price);
  return buildMetadata({
    title: `قیمت روز ${row.name}`,
    description: `قیمت روز ${row.name}${row.factory ? ` کارخانه ${row.factory}` : ''}: ${price} برای هر کیلوگرم، همراه با نوسان، وزن شاخه و زمان تحویل در آهن‌تایم.`,
    path: routes.sku(row.categoryId, row.subCategoryId, row.slug),
  });
}

export default async function SkuPage({ params }: Params) {
  const { category, sub, sku } = await params;

  // The URL must reflect the SKU's canonical category/sub — otherwise a SKU
  // would resolve under any path and create duplicate, crawlable 200s.
  const row = findSku(sku);
  if (!row || row.categoryId !== category || row.subCategoryId !== sub) notFound();

  const catName = categories.find((c) => c.slug === category)?.name ?? category;
  const subLabel = subName(category, sub) ?? sub;
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
          url: routes.sku(row.categoryId, row.subCategoryId, row.slug),
        })}
      />
      <Section space={10}>
        <SkuDetail row={row} />
      </Section>
    </Container>
  );
}
