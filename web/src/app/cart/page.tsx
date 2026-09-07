import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import {
  Container,
  Section,
  Stack,
  Heading,
  Overline,
  Text,
} from '@/components/ui';
import { CartView } from '@/components/cart/CartView';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import { getOrderPolicy, getVolumeDiscountPolicy } from '@/lib/server/repos/settingsRepo';
import { DEFAULT_ORDER_POLICY } from '@/lib/config/orderPolicy';
import { DEFAULT_VOLUME_DISCOUNT_POLICY } from '@/lib/config/pricingTiers';

// noindex'd (personal/transient cart state) — no canonical `path` since
// canonical is meaningless on a page that's never indexed.
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
          <Stack gap={2} as="header">
            <Overline>استعلام</Overline>
            <Heading level={1} id="cart-title">
              سبد استعلام
            </Heading>
            <Text color="muted">
              محصول‌های انتخابی‌تان را اینجا جمع کنید و با یک درخواست، پیش‌فاکتور بگیرید. اول مشورت، بعد خرید.
            </Text>
          </Stack>

          <CartView minimumAutoQuoteToman={policy.minimumAutoQuoteToman} volumeTiers={volumePolicy.tiers} />
        </Stack>
      </Section>
    </Container>
  );
}
