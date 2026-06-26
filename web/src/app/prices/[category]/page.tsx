import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories, rebarRows } from '@/lib/mock/fixtures';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Breadcrumbs,
  EmptyState,
  emptyPresets,
} from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';

type Params = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return categories.filter((c) => c.isActive).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const cat = categories.find((c) => c.slug === category);
  const name = cat?.name ?? category;
  return buildMetadata({
    title: `قیمت روز ${name}`,
    description: `قیمت روز ${name} با نوسان، وزن شاخه و زمان تحویل در آهن‌تایم.`,
    path: routes.category(category),
  });
}

export default async function CategoryPage({ params }: Params) {
  const { category } = await params;
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  // Only میلگرد has seeded rows in the mock; others show a tasteful "coming soon".
  const rows = category === 'rebar' ? rebarRows : [];
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
          data={rows.map((r) =>
            productJsonLd({ name: r.name, price: r.current.price, url: routes.category(category) }),
          )}
        />
      )}

      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Heading level={1} id="cat-title">
              قیمت روز {cat.name}
            </Heading>
            <Text color="muted">
              قیمت‌های لحظه‌ای {cat.name} با نوسان، وزن شاخه و زمان تحویل تضمینی. اول مشورت، بعد خرید.
            </Text>
          </div>

          {rows.length > 0 ? (
            <PriceTable rows={rows} subs={subs} categoryName={cat.name} />
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
