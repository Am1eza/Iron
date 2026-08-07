import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
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
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CutToSizeForm } from '@/components/cut-to-size/CutToSizeForm';

export const metadata: Metadata = buildMetadata({
  title: 'کالا با ابعاد درخواستی',
  description:
    'کالای خود را به آهن‌تایم بسپارید تا به ابعاد دقیقی که می‌خواهید برش و آماده تحویل شود — ورق، تسمه، میلگرد و مقاطع دیگر؛ اول مشورت و اعلام هزینه، بعد اجرا.',
  path: routes.cutToSize(),
});

const BENEFITS: { title: string; body: string }[] = [
  {
    title: 'دقیقاً به اندازهٔ نیاز شما',
    body: 'به‌جای خرید ابعاد استاندارد و دورریز، کالا را به همان اندازه‌ای که پروژه‌تان می‌خواهد تحویل بگیرید.',
  },
  {
    title: 'کاهش پرت و هزینه',
    body: 'برش دقیق یعنی مواد کمتری هدر می‌رود و هزینهٔ کار و حمل ضایعات را نمی‌پردازید.',
  },
  {
    title: 'برش صنعتی و دقیق',
    body: 'برش با دستگاه‌های صنعتی و رواداری مشخص؛ ابعاد تحویل با چیزی که سفارش داده‌اید یکی است.',
  },
  {
    title: 'آمادهٔ تحویل',
    body: 'کالای برش‌خورده بسته‌بندی و برای ارسال یا تحویل حضوری آماده می‌شود.',
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '۱', title: 'ثبت درخواست', body: 'نوع کالا و ابعاد درخواستی را در فرم زیر اعلام کنید.' },
  { n: '۲', title: 'بررسی و اعلام هزینه', body: 'کارشناس امکان برش و هزینهٔ آن را بررسی و به شما اعلام می‌کند.' },
  { n: '۳', title: 'اجرای برش', body: 'پس از تأیید شما، کالا با دستگاه صنعتی به ابعاد درخواستی برش می‌خورد.' },
  { n: '۴', title: 'تحویل', body: 'کالای آماده بسته‌بندی و برای ارسال یا تحویل هماهنگ می‌شود.' },
];

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'کالا با ابعاد درخواستی' },
];

export default function CutToSizePage() {
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />

          <Stack gap={3}>
            <Text variant="overline" color="accent">
              خدمات آهن‌تایم
            </Text>
            <Heading level={1}>کالا با ابعاد درخواستی</Heading>
            <div style={{ maxInlineSize: '60ch' }}>
              <Text color="muted">
                کالای فولادی خود را به آهن‌تایم بسپارید تا آن را به ابعاد دقیقی که پروژه‌تان نیاز
                دارد برش دهیم و آماده تحویل کنیم — از ورق و تسمه تا میلگرد و دیگر مقاطع. شما نوع کالا
                و اندازهٔ موردنظر را اعلام می‌کنید؛ ابتدا کارشناس امکان اجرا و هزینه را بررسی می‌کند و
                پس از تأیید شما، برش انجام می‌شود.
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
                <Heading level={2}>ثبت درخواست برش/تبدیل</Heading>
                <Text color="muted">
                  فرم زیر را پر کنید؛ کارشناس ما امکان اجرا و هزینه را بررسی و با شما هماهنگ می‌کند.
                </Text>
              </Stack>
              <CutToSizeForm />
            </Stack>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
