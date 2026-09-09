'use client';
import { useTranslations } from 'next-intl';
import { Heading, Text, Breadcrumbs, Stack } from '@/components/ui';
import { CategoryGrid } from '@/components/market/CategoryGrid';
import { CategoryPriceSummary } from '@/components/market/CategoryPriceSummary';
import { FeaturedPrices } from '@/components/market/FeaturedPrices';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import type { Category, PriceRow } from '@/lib/types/domain';
import type { SubsMap } from '@/lib/data/catalog';

const FAQ_COUNT = 5;

/**
 * The /prices hub's actual visible content — extracted from the Server
 * Component `page.tsx` (which keeps only `metadata`, `revalidate`, the
 * server-fetched catalog/JSON-LD data, and the fa breadcrumb labels, per
 * the established SSR-shell exception) so the H1/intro/FAQ can localize.
 * `CategoryPriceSummary`/`CategoryGrid`/`FeaturedPrices` are already
 * translated Client Components from an earlier commit.
 */
export function PricesPageContent({
  crumbs,
  categories,
  subs,
  headlineRows,
  rebarRows,
}: {
  crumbs: { label: string; href?: string }[];
  categories: Category[];
  subs: SubsMap;
  headlineRows: PriceRow[];
  rebarRows: PriceRow[];
}) {
  const t = useTranslations('pricesPage');

  return (
    <Stack gap={6}>
      <div>
        <Breadcrumbs items={crumbs} />
        <Heading level={1}>{t('title')}</Heading>
        <Text color="muted" variant="body-lg">
          {t('intro')}
        </Text>
      </div>
      <CategoryPriceSummary rows={headlineRows} categories={categories} />
      <CategoryGrid categories={categories} subs={subs} />
      <FeaturedPrices rows={rebarRows} />
      <ArticleFaq
        items={Array.from({ length: FAQ_COUNT }, (_, i) => ({
          question: t(`faq.item${i + 1}.question`),
          answer: t(`faq.item${i + 1}.answer`),
        }))}
      />
    </Stack>
  );
}
