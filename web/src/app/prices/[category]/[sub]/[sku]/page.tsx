import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';
import { findSku } from '@/lib/mock/catalogData';
import { formatToman } from '@/lib/utils/format';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container, Section } from '@/components/ui';
import { SkuDetail } from '@/components/catalog/SkuDetail';

type Params = { params: Promise<{ category: string; sub: string; sku: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sku } = await params;
  const row = findSku(sku);
  if (!row) {
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
  const { sku } = await params;

  const row = findSku(sku);
  if (!row) notFound();

  // Defensive: route must reflect the canonical category for this SKU.
  const cat = categories.find((c) => c.slug === row.categoryId);
  if (!cat) notFound();

  return (
    <Container>
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
