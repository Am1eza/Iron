import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CooperationPageContent } from '@/components/cooperation/CooperationPageContent';

export const metadata: Metadata = buildMetadata({
  title: 'همکاری با ما',
  description:
    'سه مسیر همکاری با آهن‌تایم: تحلیل اختصاصی بازار فولاد، تأمین محصول از شما، و نمایندگی فروش از ما.',
  path: routes.cooperation(),
});

/**
 * Breadcrumbs stay fa — the established SSR-shell exception (locale
 * resolves client-side only). The page's actual content is
 * `CooperationPageContent`, a Client Component that translates.
 */
export default function CooperationPage() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'همکاری با ما', href: routes.cooperation() },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="coop-title">
        <Stack gap={10}>
          <Breadcrumbs items={crumbs} />
          <CooperationPageContent />
        </Stack>
      </Section>
    </Container>
  );
}
