import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { getRows, getHeadlineRows } from '@/lib/server/catalog';
import { itemListJsonLd, catalogNavigationJsonLd } from '@/lib/seo';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PricesPageContent } from './PricesPageContent';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت روز آهن و فولاد',
  description: 'قیمت روز میلگرد، تیرآهن، پروفیل، ورق و سایر مقاطع فولادی در آهن‌تایم.',
  path: routes.prices(),
});

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;
// Catalog data is unavailable during the production image build; render the
// hub against the live DB instead of baking an empty/fixture snapshot.
export const dynamic = 'force-dynamic';

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'قیمت‌ها', href: routes.prices() },
];

export default async function PriceHubPage() {
  const [categories, subs, headlineRows, rebarAll] = await Promise.all([
    getCategories(),
    getSubsMap(),
    getHeadlineRows(),
    getRows('rebar'),
  ]);
  // Same headline row count the previous mock fixture happened to show.
  const rebarRows = rebarAll.slice(0, 6);
  // The catalog taxonomy as structured data — see catalogNavigationJsonLd.
  // This hub and the homepage are the two URLs an answer engine lands on to
  // work out what آهن‌تایم sells; it is not published site-wide.
  const catalogNav = catalogNavigationJsonLd(categories, subs);
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {catalogNav ? <JsonLd data={catalogNav} /> : null}
      {headlineRows.length > 0 ? (
        <JsonLd
          data={itemListJsonLd(
            headlineRows.map((r) => ({
              name: r.name,
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            })),
          )}
        />
      ) : null}
      <Section space={10}>
        <PricesPageContent
          crumbs={crumbs}
          categories={categories}
          subs={subs}
          headlineRows={headlineRows}
          rebarRows={rebarRows}
        />
      </Section>
    </Container>
  );
}
