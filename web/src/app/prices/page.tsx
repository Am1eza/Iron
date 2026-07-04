import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories } from '@/lib/data/catalog';
import { Container, Section, Stack, Heading, Text, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CategoryGrid } from '@/components/market/CategoryGrid';
import { FeaturedPrices } from '@/components/market/FeaturedPrices';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت روز آهن و فولاد',
  description: 'قیمت روز میلگرد، تیرآهن، پروفیل، ورق و سایر مقاطع فولادی در آهن‌تایم.',
  path: routes.prices(),
});

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;

const crumbs = [{ label: 'خانه', href: routes.home() }, { label: 'قیمت‌ها' }];

export default async function PriceHubPage() {
  const categories = await getCategories();
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            <Heading level={1}>قیمت روز آهن و فولاد</Heading>
            <Text color="muted">
              دستهٔ موردنظرت را انتخاب کن تا جدول قیمت لحظه‌ای، نوسان و زمان تحویل را ببینی.
            </Text>
          </div>
          <CategoryGrid categories={categories} />
          <FeaturedPrices />
        </Stack>
      </Section>
    </Container>
  );
}
