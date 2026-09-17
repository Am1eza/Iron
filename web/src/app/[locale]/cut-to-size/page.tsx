import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CutToSizeLanding } from '@/components/cut-to-size/CutToSizeLanding';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta.cutToSize' });
  return buildMetadata({ locale, title: t('title'), description: t('description'), path: routes.cutToSize() });
}


export default async function CutToSizePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.cutToSize.title'), href: routes.cutToSize() },
  ];
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />
          <CutToSizeLanding />
        </Stack>
      </Section>
    </Container>
  );
}
