import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { listCategories, listAllSubCategories } from '@/lib/server/repos/catalogRepo';
import { hasDb } from '@/lib/server/db/client';
import type { SubCat } from '@/lib/data/nav';
import { Container, Section, Stack, Grid, Heading, Text, Card, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TenderEstimator } from '@/components/tender/TenderEstimator';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'meta.tender' });
  return buildMetadata({ locale, title: t('title'), description: t('description'), path: routes.tender() });
}


// Same cadence as the price pages this reads from — the catalog list feeding
// the form changes about as often.
export const revalidate = 600;

const BENEFIT_KEYS = ['bulkEstimate', 'cheapestFactory', 'livePricing', 'officialProforma'] as const;

export default async function TenderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // No DB at build/prerender → an empty form shell; the client still renders
  // and repopulates once the ISR revalidate lands with real data.
  const [categories, subsByCat, t] = hasDb()
    ? await Promise.all([listCategories(), listAllSubCategories(), getTranslations()])
    : [[], {} as Record<string, SubCat[]>, await getTranslations()];
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.tender.title'), href: routes.tender() },
  ];
  const benefits = BENEFIT_KEYS.map((key) => ({
    key,
    title: t(`tenderPage.benefits.${key}.title`),
    body: t(`tenderPage.benefits.${key}.body`),
  }));

  const catOptions = categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    nameZh: c.nameZh,
  }));
  const subOptions: Record<
    string,
    { slug: string; name: string; nameEn?: string; nameAr?: string; nameZh?: string }[]
  > = {};
  for (const [cat, subs] of Object.entries(subsByCat)) {
    subOptions[cat] = subs.map((s) => ({
      slug: s.slug,
      name: s.name,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      nameZh: s.nameZh,
    }));
  }

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />

          <Stack gap={3}>
            <Text variant="overline" color="accent">
              {t('tenderPage.overline')}
            </Text>
            <Heading level={1}>{t('meta.tender.title')}</Heading>
            <div style={{ maxInlineSize: '62ch' }}>
              <Text color="muted">{t('tenderPage.lead')}</Text>
            </div>
          </Stack>

          <Grid min="16rem" gap={4}>
            {benefits.map((b) => (
              <Card key={b.key}>
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
                <Heading level={2}>{t('tenderPage.tableHeading')}</Heading>
                <Text color="muted">{t('tenderPage.tableLead')}</Text>
              </Stack>
              <TenderEstimator categories={catOptions} subsByCat={subOptions} />
            </Stack>
          </Card>
        </Stack>
      </Section>
    </Container>
  );
}
