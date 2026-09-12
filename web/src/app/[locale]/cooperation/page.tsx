import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CooperationPageContent } from '@/components/cooperation/CooperationPageContent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.cooperation');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.cooperation() });
}

export default async function CooperationPage() {
  const t = await getTranslations();
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.cooperation.title'), href: routes.cooperation() },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="coop-title">
        <Stack gap={10}>
          <Breadcrumbs items={crumbs} />
          <CooperationPageContent />
        </Stack>
      </Section>
    </Container>
  );
}
