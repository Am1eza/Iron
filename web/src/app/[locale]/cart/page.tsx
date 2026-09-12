import type { Metadata } from 'next';
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
// canonical is meaningless on a page that's never indexed. Metadata stays
// fa: locale resolves client-side only, so this Server Component's own text
// can't localize — the same established SSR-shell exception every other
// page's `metadata` export uses. The actual on-page copy is
// `CartPageHeader`, a Client Component that does localize.
export const metadata: Metadata = buildMetadata({
  title: 'سبد استعلام',
  description: 'محصول‌های انتخابی خود را در سبد استعلام جمع کنید و یک‌جا پیش‌فاکتور بگیرید. در آهن‌تایم پرداخت آنلاین نداریم؛ کارشناس برای نهایی‌کردن قیمت و تحویل تماس می‌گیرد.',
  noindex: true,
});

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
