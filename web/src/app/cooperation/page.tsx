import type { Metadata } from 'next';
import { buildMetadata, ORG_NAME } from '@/lib/seo';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Grid,
  Breadcrumbs,
  Heading,
  Text,
  Divider,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TrackCard } from '@/components/cooperation/TrackCard';
import { TRACKS, TRACK_ORDER } from '@/components/cooperation/tracks';

export const metadata: Metadata = buildMetadata({
  title: 'همکاری با ما',
  description:
    'سه مسیر همکاری با آهن‌تایم: تحلیل اختصاصی بازار فولاد، تأمین محصول از شما، و نمایندگی فروش از ما.',
  path: routes.cooperation(),
});

export default function CooperationPage() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'همکاری با ما' },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="coop-title">
        <Stack gap={10}>
          <Stack gap={4}>
            <Breadcrumbs items={crumbs} />
            <Text variant="overline" color="accent">
              همکاری با آهن‌تایم
            </Text>
            <Heading level={1} id="coop-title">
              با هم بازار فولاد را شفاف‌تر کنیم
            </Heading>
            <Text variant="body-lg" color="muted">
              {ORG_NAME} برای رشدِ کنار هم ساخته شده است. چه به دنبال تحلیل دقیق بازار
              باشید، چه بخواهید محصولتان را عرضه کنید یا نمایندهٔ فروش ما شوید، یکی از این
              سه مسیر برای شما هست. مسیر مناسب را انتخاب کنید؛ کارشناسان ما در ادامه با شما
              هماهنگ می‌شوند.
            </Text>
          </Stack>

          <Divider />

          <Grid min="280px" gap={6}>
            {TRACK_ORDER.map((key) => {
              const t = TRACKS[key];
              return (
                <TrackCard
                  key={key}
                  href={routes.cooperation(t.key)}
                  icon={t.icon}
                  title={t.title}
                  desc={t.summary}
                  audience={t.audience}
                  cta={t.cta}
                />
              );
            })}
          </Grid>

          <Text variant="body-sm" color="muted">
            مطمئن نیستید کدام مسیر مناسب شماست؟ بدون نگرانی فرم هر مسیر را پر کنید؛ ما
            راهنمایی‌تان می‌کنیم.
          </Text>
        </Stack>
      </Section>
    </Container>
  );
}
