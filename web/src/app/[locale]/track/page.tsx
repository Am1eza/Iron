import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { TrackPageHeader } from './TrackPageHeader';
import { TrackLookup } from './TrackLookup';

export const metadata: Metadata = buildMetadata({
  title: 'پیگیری سفارش',
  description: 'با کد پیگیری، وضعیت لحظه‌ای حمل بار خود را ببینید.',
  path: routes.track(),
  noindex: true,
});

// Breadcrumb labels stay fa — the established SSR-shell exception (locale
// resolves client-side only, so this Server Component's own text can't
// localize). The page's actual content is `TrackPageHeader`/`TrackLookup`,
// both Client Components that do.
export default function TrackPage() {
  return (
    <Container>
      <Section space={12}>
        <Stack gap={6}>
          <Breadcrumbs
            items={[{ label: 'خانه', href: routes.home() }, { label: 'پیگیری سفارش' }]}
          />
          <TrackPageHeader />
          <TrackLookup />
        </Stack>
      </Section>
    </Container>
  );
}
