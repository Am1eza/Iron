'use client';
import { useTranslations } from 'next-intl';
import { Stack, Text, Heading } from '@/components/ui';

/** The track page's overline/H1/intro — split out of the Server Component
 *  page so this content can localize (mirrors WarehouseLanding/
 *  CutToSizeLanding/CartPageHeader from earlier commits on this branch). */
export function TrackPageHeader() {
  const t = useTranslations('track');
  return (
    <Stack gap={2}>
      <Text variant="overline" color="accent">
        {t('overline')}
      </Text>
      <Heading level={1}>{t('title')}</Heading>
      <Text color="muted">{t('intro')}</Text>
    </Stack>
  );
}
