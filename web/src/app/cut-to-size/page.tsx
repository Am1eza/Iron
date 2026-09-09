import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CutToSizeLanding } from '@/components/cut-to-size/CutToSizeLanding';

export const metadata: Metadata = buildMetadata({
  title: 'کالا با ابعاد درخواستی',
  description:
    'کالای خود را به آهن‌تایم بسپارید تا به ابعاد دقیقی که می‌خواهید برش و آماده تحویل شود، از ورق و تسمه تا میلگرد و مقاطع دیگر؛ اول مشورت و اعلام هزینه، بعد اجرا.',
  path: routes.cutToSize(),
});

// Breadcrumb labels stay fa — the established SSR-shell exception (see
// `prices/[category]/page.tsx` etc.): locale resolves client-side only, so
// this Server Component's own text can't localize. The page's actual
// content — benefits, steps, the form — is `CutToSizeLanding`, a Client
// Component that does.
const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'کالا با ابعاد درخواستی', href: routes.cutToSize() },
];

export default function CutToSizePage() {
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <Section space={12}>
        <Stack gap={8}>
          <Breadcrumbs items={crumbs} />
          <CutToSizeLanding />
        </Stack>
      </Section>
    </Container>
  );
}
