import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { Container, Section, Stack } from '@/components/ui';
import { CartPageHeader } from '@/components/cart/CartPageHeader';
import { CartView } from '@/components/cart/CartView';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import { getOrderPolicy, getVolumeDiscountPolicy } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_ORDER_POLICY } from '@/lib/config/orderPolicy';
import { DEFAULT_VOLUME_DISCOUNT_POLICY } from '@/lib/config/pricingTiers';

// noindex'd (personal/transient cart state) — no canonical `path` since
// canonical is meaningless on a page that's never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.cart');
  return buildMetadata({ title: t('title'), description: t('description'), noindex: true });
}

export default async function CartPage() {
  const [policy, volumePolicy] =
    API_MODE === 'live' && hasDb()
      ? await Promise.all([getOrderPolicy(), getVolumeDiscountPolicy()])
      : [DEFAULT_ORDER_POLICY, DEFAULT_VOLUME_DISCOUNT_POLICY];
  return (
    <Container>
      <Section space={10}>
        <Stack gap={6}>
          <CartPageHeader />

          <CartView minimumAutoQuoteToman={policy.minimumAutoQuoteToman} volumeTiers={volumePolicy.tiers} />
        </Stack>
      </Section>
    </Container>
  );
}
