import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { listCategories, listAllSubCategories } from '@/lib/server/repos/catalogRepo';
import { hasDb } from '@/lib/server/db/client';
import { Container, Section, Stack, Grid, Heading, Text, Card, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TenderEstimator } from '@/components/tender/TenderEstimator';

export const metadata: Metadata = buildMetadata({
  title: 'برآورد مناقصات و استعلام‌ها',
  description:
    'چند ده قلم مناقصه را یک‌جا برآورد کنید: هر قلم را از محصولات آهن‌تایم انتخاب کنید، سیستم ارزان‌ترین کارخانه را پیشنهاد می‌دهد، وزن و قیمت روز را حساب می‌کند و جمع کل و پیش‌فاکتور رسمی را به شما می‌دهد.',
  path: routes.tender(),
});

// Same cadence as the price pages this reads from — the catalog list feeding
// the form changes about as often.
export const revalidate = 600;

const BENEFITS: { title: string; body: string }[] = [
  {
    title: 'ده‌ها قلم، یک برآورد',
    body: 'به‌جای قیمت‌گرفتن و وزن‌کردن تک‌تک اقلام مناقصه، همه را در یک جدول وارد کنید و جمع کل را یک‌جا بگیرید.',
  },
  {
    title: 'ارزان‌ترین کارخانه، خودکار',
    body: 'برای هر قلم، ارزان‌ترین کارخانه به‌صورت پیش‌فرض انتخاب می‌شود — و اگر مناقصه کارخانهٔ خاصی خواست، خودتان تغییرش می‌دهید.',
  },
  {
    title: 'قیمت و وزن روز',
    body: 'وزن هر قلم بر پایهٔ ابعاد و قیمت بر پایهٔ نرخ روز آهن‌تایم محاسبه می‌شود؛ نه تخمین دستی، نه خطای ضرب‌وجمع.',
  },
  {
    title: 'پیش‌فاکتور رسمی',
    body: 'خروجی نهایی با سربرگ رسمی آهن‌تایم صادر می‌شود؛ همان سندی که می‌توانید ضمیمهٔ مناقصه کنید.',
  },
];

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'برآورد مناقصات' },
];

export default async function TenderPage() {
  // No DB at build/prerender → an empty form shell; the client still renders
  // and repopulates once the ISR revalidate lands with real data.
  const [categories, subsByCat] = hasDb()
    ? await Promise.all([listCategories(), listAllSubCategories()])
    : [[], {} as Record<string, { slug: string; name: string; groupLabel: string | null }[]>];

  const catOptions = categories.map((c) => ({ slug: c.slug, name: c.name }));
  const subOptions: Record<string, { slug: string; name: string }[]> = {};
  for (const [cat, subs] of Object.entries(subsByCat)) {
    subOptions[cat] = subs.map((s) => ({ slug: s.slug, name: s.name }));
  }

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
            <Heading level={1}>برآورد مناقصات و استعلام‌ها</Heading>
            <div style={{ maxInlineSize: '62ch' }}>
              <Text color="muted">
                یک مناقصه ممکن است ده‌ها قلم کالای مختلف داشته باشد که باید برای هرکدام قیمت روز گرفته
                شود، در وزن ضرب و با هم جمع شود. این ابزار همهٔ این کارها را یک‌جا انجام می‌دهد: اقلام
                را از محصولات آهن‌تایم انتخاب می‌کنید، ارزان‌ترین کارخانه به‌صورت خودکار پیشنهاد می‌شود
                (و قابل تغییر است)، و جمع کل به‌همراه پیش‌فاکتور رسمی برای شما آماده می‌شود.
              </Text>
            </div>
          </Stack>

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

          <Card>
            <Stack gap={5}>
              <Stack gap={1}>
                <Heading level={2}>جدول برآورد</Heading>
                <Text color="muted">
                  برای هر قلم دسته، محصول، سایز و مقدار را انتخاب کنید. قیمت، وزن و جمع هر ردیف زنده
                  محاسبه می‌شود.
                </Text>
              </Stack>
              <TenderEstimator categories={catOptions} subsByCat={subOptions} />
            </Stack>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
