import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CooperationTrackContent } from '@/components/cooperation/CooperationTrackContent';
import { TRACKS, TRACK_ORDER, isTrackKey } from '@/components/cooperation/tracks';

type Params = { params: Promise<{ track: string }> };

export function generateStaticParams() {
  return TRACK_ORDER.map((track) => ({ track }));
}

/* An unknown track is turned into a real 404 by middleware (see
 * lib/server/seo/knownPaths.ts) — `notFound()` below does not set the status
 * in this Next version, so on its own it produced a cached Soft 404 200. */

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

/**
 * Breadcrumbs stay fa (reading `TRACKS[track].title`, unchanged) — the
 * established SSR-shell exception. The page's actual content is
 * `CooperationTrackContent`, a Client Component that translates.
 */
export default async function CooperationTrackPage({ params }: Params) {
  const { track } = await params;
  if (!isTrackKey(track)) notFound();
  const t = TRACKS[track];

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'همکاری با ما', href: routes.cooperation() },
    { label: t.title, href: routes.cooperation(t.key) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="track-title">
        <Stack gap={10}>
          <Breadcrumbs items={crumbs} />
          <CooperationTrackContent track={track} />
        </Stack>
      </Section>
    </Container>
  );
}
