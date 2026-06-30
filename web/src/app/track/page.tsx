import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Heading, Text, Breadcrumbs } from '@/components/ui';
import { TrackLookup } from './TrackLookup';

export const metadata: Metadata = buildMetadata({
  title: 'پیگیری سفارش',
  description: 'با کد پیگیری، وضعیت لحظه‌ای حمل بار خود را ببینید.',
  path: routes.track(),
  noindex: true,
});

export default function TrackPage() {
  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Breadcrumbs
            items={[{ label: 'خانه', href: routes.home() }, { label: 'پیگیری سفارش' }]}
          />
          <Stack gap={2}>
            <Text variant="overline" color="accent">
              پیگیری بار
            </Text>
            <Heading level={1}>پیگیری سفارش</Heading>
            <Text color="muted">
              کد پیگیری سفارش خود را وارد کنید تا وضعیت فعلی حمل بار را ببینید.
            </Text>
          </Stack>
          <TrackLookup />
        </Stack>
      </Section>
    </Container>
  );
}
