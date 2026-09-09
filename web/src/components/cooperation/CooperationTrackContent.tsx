'use client';
import { useTranslations } from 'next-intl';
import { Stack, Heading, Text } from '@/components/ui';
import { CheckIcon } from '@/components/primitives/icons';
import { CooperationForm } from './CooperationForm';
import { TRACKS, type TrackKey } from './tracks';
import layout from './TrackLayout.module.css';

const POINT_COUNT = 4;

/**
 * The translated half of one /cooperation/[track] page (`app/cooperation/
 * [track]/page.tsx` stays a Server Component for `generateMetadata`/
 * `generateStaticParams` and its own fa breadcrumbs — the established
 * SSR-shell exception). `track` is the only prop; `TRACKS[track].icon`
 * (a ReactNode, not translatable text) is the only thing still read from
 * the shared fa-only `tracks.tsx` data — every visible string comes from
 * `cooperation.tracks.${track}.*` instead.
 */
export function CooperationTrackContent({ track }: { track: TrackKey }) {
  const t = useTranslations('cooperation');
  const points = Array.from({ length: POINT_COUNT }, (_, i) => t(`tracks.${track}.point${i + 1}`));

  return (
    <div className={layout.grid}>
      <Stack gap={8}>
        <Stack gap={4}>
          <Text variant="overline" color="accent">
            {t(`tracks.${track}.eyebrow`)}
          </Text>
          <div className={layout.header}>
            <span className={layout.icon} aria-hidden>
              {TRACKS[track].icon}
            </span>
            <Heading level={1} id="track-title">
              {t(`tracks.${track}.title`)}
            </Heading>
          </div>
          <Text variant="body-lg" color="muted">
            {t(`tracks.${track}.lead`)}
          </Text>
        </Stack>

        <Stack gap={4}>
          <Heading level={2}>{t('trackPage.includesHeading')}</Heading>
          <ul className={layout.points}>
            {points.map((point) => (
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

      <div className={layout.formCard}>
        <div className={layout.formHead}>
          <h2 className={layout.formTitle}>{t('trackPage.formHeading')}</h2>
          <p className={layout.formNote}>{t(`tracks.${track}.formNote`)}</p>
        </div>
        <CooperationForm track={track} />
      </div>
    </div>
  );
}
