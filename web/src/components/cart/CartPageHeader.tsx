'use client';
import { useTranslations } from 'next-intl';
import { Stack, Overline, Heading, Text } from '@/components/ui';

/**
 * The cart page's own overline/H1/intro — split out of `app/cart/page.tsx`
 * (a Server Component, for its `metadata` export) so this actual on-page
 * copy can localize, matching the WarehouseLanding/CutToSizeLanding pattern.
 */
export function CartPageHeader() {
  const t = useTranslations('cart');

  return (
    <Stack gap={2} as="header">
      <Overline>{t('pageOverline')}</Overline>
      <Heading level={1} id="cart-title">
        {t('pageTitle')}
      </Heading>
      <Text color="muted">{t('pageIntro')}</Text>
    </Stack>
  );
}
