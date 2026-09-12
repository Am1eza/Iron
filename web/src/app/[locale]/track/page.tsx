import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { TrackPageHeader } from './TrackPageHeader';
import { TrackLookup } from './TrackLookup';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.track');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.track(), noindex: true });
}

export default async function TrackPage() {
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
