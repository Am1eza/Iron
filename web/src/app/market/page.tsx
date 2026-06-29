import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Heading,
  Text,
  Overline,
  Breadcrumbs,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { MarketBoard } from '@/components/market/MarketBoard';

export const metadata: Metadata = buildMetadata({
  title: 'طلا، ارز و شمش فولاد',
  description:
    'نرخ لحظه‌ای دلار، یورو، طلای ۱۸ عیار، انس جهانی و شمش فولاد در آهن‌تایم — همان متغیرهایی که قیمت روز آهن‌آلات را جابه‌جا می‌کنند.',
  path: routes.market(),
});

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'طلا، ارز و شمش' },
];

export default function MarketPage() {
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <Stack gap={8}>
          <Stack gap={3}>
            <Breadcrumbs items={crumbs} />
            <Overline>نبض بازار</Overline>
            <Heading level={1} id="market-title">
              طلا، ارز و شمش فولاد
            </Heading>
            <Text color="muted" variant="body-lg">
              قیمت آهن‌آلات روی هواست؛ موتور آن دلار، نرخ شمش و بهای جهانی فولاد است. وقتی دلار
              بالا می‌رود، میلگرد و تیرآهن هم دیر یا زود همان مسیر را می‌روند. این صفحه برای همان
              کسانی است که هر روز نرخ دلار را چک می‌کنند — اینجا یک قدم جلوتر، تأثیرش بر بازار آهن را
              هم می‌بینید. اول مشورت، بعد خرید.
            </Text>
          </Stack>

          <MarketBoard />
        </Stack>
      </Section>
    </Container>
  );
}
