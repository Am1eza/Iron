import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CooperationPageContent } from '@/components/cooperation/CooperationPageContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta.cooperation' });
  return buildMetadata({ locale, title: t('title'), description: t('description'), path: routes.cooperation() });
}


export default async function CooperationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
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
