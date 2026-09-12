import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { WarehouseLanding } from '@/components/warehouse/WarehouseLanding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.warehouse');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.warehouse() });
}

export default async function WarehousePage() {
  const t = await getTranslations();
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.warehouse.title'), href: routes.warehouse() },
  ];
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />
          <WarehouseLanding />
        </Stack>
      </Section>
    </Container>
  );
}
