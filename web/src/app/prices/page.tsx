import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { getRows } from '@/lib/server/catalog';
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
  const subs = await getSubsMap();
  // Same headline row count the previous mock fixture happened to show.
  const rebarRows = (await getRows('rebar')).slice(0, 6);
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
          <CategoryGrid categories={categories} subs={subs} />
          <FeaturedPrices rows={rebarRows} />
        </Stack>
      </Section>
    </Container>
  );
}
