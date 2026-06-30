import type { Metadata } from 'next';
import { buildMetadata, breadcrumbJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Grid,
  Heading,
  Text,
  Card,
  Breadcrumbs,
} from '@/components/ui';
import { WarehouseForm } from '@/components/warehouse/WarehouseForm';

export const metadata: Metadata = buildMetadata({
  title: 'انبار مشتریان',
  description:
    'کالای خود را با هزینه‌ای اندک نزد آهن‌تایم نگهداری کنید و هر زمان که بازار مناسب بود بفروشید؛ امنیت، بیمه و نقدشوندگی تضمین‌شده.',
  path: routes.warehouse(),
});

const BENEFITS: { title: string; body: string }[] = [
  {
    title: 'امنیت کامل',
    body: 'انبار سرپوشیده با نگهبانی و کنترل دائمی؛ کالای شما با خیال راحت نگهداری می‌شود.',
  },
  {
    title: 'بیمهٔ کالا',
    body: 'تمام موجودی شما تحت پوشش بیمه است و در برابر حوادث جبران می‌شود.',
  },
  {
    title: 'فروش به‌موقع',
    body: 'هر زمان قیمت بازار مناسب شد، کارشناس ما کالا را برای شما می‌فروشد.',
  },
  {
    title: 'نقدشوندگی سریع',
    body: 'با شبکهٔ خریداران آهن‌تایم، تبدیل موجودی به پول نقد در کوتاه‌ترین زمان انجام می‌شود.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '۱', title: 'ثبت درخواست', body: 'نوع و مقدار کالا را در فرم زیر اعلام کنید.' },
  { n: '۲', title: 'تحویل و قرارداد', body: 'کالا را تحویل می‌دهید و قرارداد نگهداری بسته می‌شود.' },
  { n: '۳', title: 'نگهداری امن', body: 'موجودی شما در انبار بیمه‌شده با هزینهٔ ماهانهٔ مشخص نگهداری می‌شود.' },
  { n: '۴', title: 'فروش و تسویه', body: 'در زمان مناسب می‌فروشیم و وجه را تسویه می‌کنیم.' },
];

export default function WarehousePage() {
  return (
    <Container>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'خانه', url: routes.home() },
              { name: 'انبار مشتریان', url: routes.warehouse() },
            ]),
          ),
        }}
      />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs
            items={[{ label: 'خانه', href: routes.home() }, { label: 'انبار مشتریان' }]}
          />

          <Stack gap={3}>
            <Text variant="overline" color="accent">
              خدمات آهن‌تایم
            </Text>
            <Heading level={1}>انبار مشتریان</Heading>
            <div style={{ maxInlineSize: '60ch' }}>
              <Text color="muted">
                کالای خود را نزد آهن‌تایم به امانت بسپارید. ما آن را در انبار امن و بیمه‌شده نگهداری
                می‌کنیم و هر زمان که بازار مناسب بود، آن را برای شما می‌فروشیم. شما تنها هزینهٔ اندک
                نگهداری ماهانه را می‌پردازید و از نوسان قیمت و نقدشوندگی بهره می‌برید.
              </Text>
            </div>
          </Stack>

          {/* Benefits */}
          <Grid min="16rem" gap={4}>
            {BENEFITS.map((b) => (
              <Card key={b.title}>
                <Stack gap={2}>
                  <Heading level={3}>{b.title}</Heading>
                  <Text color="muted" variant="body-sm">
                    {b.body}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>

          {/* How it works */}
          <Stack gap={4}>
            <Heading level={2}>چطور کار می‌کند؟</Heading>
            <Grid min="14rem" gap={4}>
              {STEPS.map((s) => (
                <Card key={s.n}>
                  <Stack gap={2}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        inlineSize: '2rem',
                        blockSize: '2rem',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--color-accent-tint)',
                        color: 'var(--color-accent-text)',
                        font: 'var(--t-label)',
                      }}
                    >
                      {s.n}
                    </span>
                    <Heading level={4}>{s.title}</Heading>
                    <Text color="muted" variant="body-sm">
                      {s.body}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Grid>
          </Stack>

          {/* Request form */}
          <Card>
            <Stack gap={5}>
              <Stack gap={1}>
                <Heading level={2}>درخواست نگهداری کالا</Heading>
                <Text color="muted">
                  فرم زیر را پر کنید؛ کارشناس ما برای هماهنگی تحویل و عقد قرارداد با شما تماس می‌گیرد.
                </Text>
              </Stack>
              <WarehouseForm />
            </Stack>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
