import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CooperationTrackContent } from '@/components/cooperation/CooperationTrackContent';
import { TRACKS, TRACK_ORDER, isTrackKey } from '@/components/cooperation/tracks';

type Params = { params: Promise<{ locale: string; track: string }> };

export function generateStaticParams() {
  return TRACK_ORDER.map((track) => ({ track }));
}

/* An unknown track is turned into a real 404 by middleware (see
 * lib/server/seo/knownPaths.ts) — `notFound()` below does not set the status
 * in this Next version, so on its own it produced a cached Soft 404 200. */

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, track } = await params;
  setRequestLocale(locale);
  const tMeta = await getTranslations('meta.cooperation');
  if (!isTrackKey(track)) {
    return buildMetadata({ title: tMeta('title'), path: routes.cooperation() });
  }
  // `cooperation.tracks.${track}.*` is the SAME translated namespace
  // `CooperationTrackContent`/`CooperationPageContent` already read for the
  // page's visible copy — title/metaDescription here are just that data
  // used for the <title> tag instead of JSX.
  const tTrack = await getTranslations(`cooperation.tracks.${track}`);
  return buildMetadata({
    title: `${tMeta('title')} · ${tTrack('title')}`,
    description: tTrack('metaDescription'),
    path: routes.cooperation(TRACKS[track].key),
  });
}


export default async function CooperationTrackPage({ params }: Params) {
  const { locale, track } = await params;
  setRequestLocale(locale);
  if (!isTrackKey(track)) notFound();
  const [tNav, tTrack] = await Promise.all([getTranslations(), getTranslations(`cooperation.tracks.${track}`)]);

  const crumbs = [
    { label: tNav('nav.home'), href: routes.home() },
    { label: tNav('meta.cooperation.title'), href: routes.cooperation() },
    { label: tTrack('title'), href: routes.cooperation(TRACKS[track].key) },
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
