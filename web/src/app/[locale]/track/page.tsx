import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { TrackPageHeader } from './TrackPageHeader';
import { TrackLookup } from './TrackLookup';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta.track' });
  return buildMetadata({ locale, title: t('title'), description: t('description'), path: routes.track(), noindex: true });
}


export default async function TrackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Breadcrumbs
            items={[{ label: t('nav.home'), href: routes.home() }, { label: t('meta.track.title') }]}
          />
          <TrackPageHeader />
          <TrackLookup />
        </Stack>
      </Section>
    </Container>
  );
}
