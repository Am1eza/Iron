import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, productJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';
import { getRows } from '@/lib/mock/catalogData';
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
import { CategoryBrowser } from '@/components/catalog/CategoryBrowser';
import { BulkQuote } from '@/components/catalog/BulkQuote';
import { ProductImage } from '@/components/catalog/ProductImage';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { productImage } from '@/lib/data/productImages';
import styles from './page.module.css';

type Params = { params: Promise<{ category: string }> };

export function generateStaticParams() {
  return categories.filter((c) => c.isActive).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
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
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const rows = getRows(category);
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
            <div className={styles.header}>
              <div className={styles.headerText}>
                <Heading level={1} id="cat-title">
                  قیمت روز {cat.name}
                </Heading>
                <Text color="muted">
                  قیمت‌های لحظه‌ای {cat.name} با نوسان، وزن شاخه و زمان تحویل اعلام‌شده. اول مشورت، بعد خرید.
                </Text>
              </div>
              <figure className={styles.media}>
                {productImage(category) ? (
                  <ProductImage slug={category} name={cat.name} eager />
                ) : (
                  <span className={styles.art} aria-hidden="true">
                    <CategoryArt slug={category} size={72} />
                  </span>
                )}
              </figure>
            </div>
          </div>

          {rows.length > 0 ? (
            <>
              <CategoryBrowser
                category={category}
                categoryName={cat.name}
                rows={rows}
                subs={subs}
              />
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
