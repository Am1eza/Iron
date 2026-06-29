import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Breadcrumbs,
  Heading,
  Text,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CheckIcon } from '@/components/primitives/icons';
import { CooperationForm } from '@/components/cooperation/CooperationForm';
import { TRACKS, TRACK_ORDER, isTrackKey } from '@/components/cooperation/tracks';
import layout from '@/components/cooperation/TrackLayout.module.css';

type Params = { params: Promise<{ track: string }> };

export function generateStaticParams() {
  return TRACK_ORDER.map((track) => ({ track }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { track } = await params;
  if (!isTrackKey(track)) {
    return buildMetadata({ title: 'همکاری با ما', path: routes.cooperation() });
  }
  const t = TRACKS[track];
  return buildMetadata({
    title: `همکاری · ${t.title}`,
    description: t.metaDescription,
    path: routes.cooperation(t.key),
  });
}

export default async function CooperationTrackPage({ params }: Params) {
  const { track } = await params;
  if (!isTrackKey(track)) notFound();
  const t = TRACKS[track];

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'همکاری با ما', href: routes.cooperation() },
    { label: t.title },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="track-title">
        <Stack gap={10}>
          <Breadcrumbs items={crumbs} />

          <div className={layout.grid}>
            {/* Explainer */}
            <Stack gap={8}>
              <Stack gap={4}>
                <Text variant="overline" color="accent">
                  {t.eyebrow}
                </Text>
                <div className={layout.header}>
                  <span className={layout.icon} aria-hidden>
                    {t.icon}
                  </span>
                  <Heading level={1} id="track-title">
                    {t.title}
                  </Heading>
                </div>
                <Text variant="body-lg" color="muted">
                  {t.lead}
                </Text>
              </Stack>

              <Stack gap={4}>
                <Heading level={2}>این همکاری شامل چه می‌شود؟</Heading>
                <ul className={layout.points}>
                  {t.points.map((point) => (
                    <li key={point} className={layout.point}>
                      <span className={layout.check} aria-hidden>
                        <CheckIcon size={18} />
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </Stack>
            </Stack>

            {/* Lead form */}
            <div className={layout.formCard}>
              <div className={layout.formHead}>
                <h2 className={layout.formTitle}>درخواست همکاری</h2>
                <p className={layout.formNote}>{t.formNote}</p>
              </div>
              <CooperationForm track={t.key} />
            </div>
          </div>
        </Stack>
      </Section>
    </Container>
  );
}
