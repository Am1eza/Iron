import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { WarehouseLanding } from '@/components/warehouse/WarehouseLanding';

export const metadata: Metadata = buildMetadata({
  title: 'انبار مشتریان',
  description:
    'کالای خود را با هزینه‌ای اندک نزد آهن‌تایم نگهداری کنید و هر زمان که بازار مناسب بود بفروشید؛ امنیت، بیمه و نقدشوندگی تضمین‌شده.',
  path: routes.warehouse(),
});

// Breadcrumb labels stay fa — the established SSR-shell exception (see
// `prices/[category]/page.tsx` etc.): locale resolves client-side only, so
// this Server Component's own text can't localize. The page's actual
// content — benefits, steps, the form — is `WarehouseLanding`, a Client
// Component that does.
const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'انبار مشتریان', href: routes.warehouse() },
];

export default function WarehousePage() {
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />
          <WarehouseLanding />
        </Stack>
      </Section>
    </Container>
  );
}
