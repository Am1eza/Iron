'use client';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { Stack, Grid, Text, Heading, Divider } from '@/components/ui';
import { TrackCard } from './TrackCard';
import { TRACKS, TRACK_ORDER } from './tracks';

/**
 * The translated half of /cooperation (`app/cooperation/page.tsx` stays a
 * Server Component for `metadata` and its own fa breadcrumbs — the
 * established SSR-shell exception this whole app uses). `TRACKS` itself
 * stays untouched/fa-only (still read server-side for metadata/breadcrumbs
 * on the track pages) — every visible string here comes from `cooperation.*`
 * translations instead, same split as `MarketPageContent`/`WarehouseLanding`.
 */
export function CooperationPageContent() {
  const t = useTranslations('cooperation');
  const tCommon = useTranslations('common');
  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <Text variant="overline" color="accent">
          {t('indexOverline')}
        </Text>
        <Heading level={1} id="coop-title">
          {t('indexH1')}
        </Heading>
        <Text variant="body-lg" color="muted">
          {t('indexLede', { brand: tCommon('brand') })}
        </Text>
      </Stack>

      <Divider />

      <Grid min="280px" gap={6}>
        {TRACK_ORDER.map((key) => (
          <TrackCard
            key={key}
            href={routes.cooperation(TRACKS[key].key)}
            icon={TRACKS[key].icon}
            title={t(`tracks.${key}.title`)}
            desc={t(`tracks.${key}.summary`)}
            audience={t(`tracks.${key}.audience`)}
            cta={t(`tracks.${key}.cta`)}
          />
        ))}
      </Grid>

      <Text variant="body-sm" color="muted">
        {t('indexFooterNote')}
      </Text>
    </Stack>
  );
}
