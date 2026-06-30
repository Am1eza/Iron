import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Heading,
  Overline,
  Text,
} from '@/components/ui';
import { CartView } from '@/components/cart/CartView';

export const metadata: Metadata = buildMetadata({
  title: 'سبد استعلام',
  description: 'محصول‌های انتخابی خود را در سبد استعلام جمع کنید و یک‌جا پیش‌فاکتور بگیرید. در آهن‌تایم پرداخت آنلاین نداریم؛ کارشناس برای نهایی‌کردن قیمت و تحویل تماس می‌گیرد.',
  path: routes.cart(),
  noindex: true,
});

export default function CartPage() {
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

          <CartView />
        </Stack>
      </Section>
    </Container>
  );
}
