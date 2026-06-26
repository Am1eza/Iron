import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories } from '@/lib/data/catalog';
import { Container, Section, Stack, Heading, Text, Breadcrumbs } from '@/components/ui';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { FeaturedPrices } from '@/components/home/FeaturedPrices';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت روز آهن و فولاد',
  description: 'قیمت روز میلگرد، تیرآهن، پروفیل، ورق و سایر مقاطع فولادی در پولادین.',
  path: routes.prices(),
});

export default async function PriceHubPage() {
  const categories = await getCategories();
  return (
    <Container>
      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={[{ label: 'خانه', href: routes.home() }, { label: 'قیمت‌ها' }]} />
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
