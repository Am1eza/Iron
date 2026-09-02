import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, itemListJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories as mockCategories } from '@/lib/mock/fixtures';
import { getCategories, getRows, getSubRows, getFactoryOrder } from '@/lib/server/catalog';
import { MOCK_CATEGORY_SUBS } from '@/lib/data/nav';
import { getSubsMap } from '@/lib/data/catalog';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { factoryIsMeaningful, subCategorySubject } from '@/lib/utils/catalogLabels';
import { toPersianDigits } from '@/lib/utils/format';
import { DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';
import { shouldPrerenderMockParams } from '@/lib/server/seo/prerenderParams';
import { taxonomyIsIndexable } from '../../_seo/indexability';
import { Container, Section, Stack, Breadcrumbs, EmptyState, emptyPresets } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PriceTable } from '@/components/catalog/PriceTable';
import { PriceHeader } from '@/components/catalog/PriceHeader';
import { BulkQuote } from '@/components/catalog/BulkQuote';

type Params = {
  params: Promise<{ category: string; sub: string }>;
};

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

/**
 * Fixture-derived — gated. See `lib/server/seo/prerenderParams.ts`. These pairs
 * come from `MOCK_CATEGORY_SUBS`, which is a mock/seed fixture and no longer matches
 * the live taxonomy in either direction, so prerendering from it baked pages
 * for sub-categories that do not exist and none for the ones that do.
 */
export function generateStaticParams() {
  if (!shouldPrerenderMockParams()) return [];
  return mockCategories
    .flatMap((c) =>
      (MOCK_CATEGORY_SUBS[c.slug] ?? []).map((s) => ({ category: c.slug, sub: s.slug })),
    );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub } = await params;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  const name = ((await getSubsMap())[category] ?? []).find((x) => x.slug === sub)?.name;
  if (!cat || !name) {
    return buildMetadata({ title: 'صفحه پیدا نشد', noindex: true });
  }
  // «میلگرد آجدار», not «میلگرد آجدار میلگرد» — see subCategorySubject.
  const subject = subCategorySubject(name, cat.name);
  // SEO audit: every sub-category page previously shared one identical meta
  // description template with only `subject` swapped in, giving a searcher no
  // page-specific signal to judge relevance from. `getSubRows` is the same
  // query the page body already runs, so this is one extra call, not a new
  // data source. Factory count only counts rows that actually publish one —
  // several families (see `factoryIsMeaningful`) withhold it by design, and
  // a description bragging «۰ کارخانه» would read as broken.
  const rows = await getSubRows(category, sub);
  // A sub-category with no rows publishes no table, so it may neither promise
  // one nor be indexed — the rule, and the 17 production pages that were
  // doing both, are in `_seo/indexability.ts`. The branch removed from
  // `description` below IS the soft-404 the audit caught: «جدول قیمت روز مش
  // استنلس استیل با نوسان، وزن شاخه، استاندارد و زمان تحویل» shipped on a
  // zero-row page. `path` is still passed so the canonical stays
  // self-referential; a noindex page whose canonical points elsewhere sends
  // two contradictory instructions about the same URL.
  if (!taxonomyIsIndexable(rows.length)) {
    return buildMetadata({
      title: subject,
      description: `هنوز کالایی در ${subject} ثبت نشده است. برای استعلام قیمت و موجودی با کارشناسان آهن‌تایم تماس بگیرید.`,
      path: routes.subCategory(category, sub),
      noindex: true,
    });
  }
  const factoryCount = new Set(rows.map((r) => r.factory).filter((f): f is string => Boolean(f)))
    .size;
  const stats =
    factoryCount > 0
      ? `${toPersianDigits(rows.length)} کالا از ${toPersianDigits(factoryCount)} کارخانه`
      : `${toPersianDigits(rows.length)} کالا`;
  return buildMetadata({
    title: `قیمت روز ${subject}`,
    description: `جدول قیمت روز ${subject}: ${stats}، به‌روزرسانی روزانه در آهن‌تایم. اول مشورت، بعد خرید.`,
    path: routes.subCategory(category, sub),
  });
}

export default async function SubCategoryPage({ params }: Params) {
  const { category, sub } = await params;

  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();

  const subs = (await getSubsMap())[category] ?? [];
  const name = subs.find((x) => x.slug === sub)?.name;
  if (!name) notFound();

  const [rows, allRows, logisticsConfig, vatRate, factoryOrder] = await Promise.all([
    getSubRows(category, sub),
    getRows(category),
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
    // Per CATEGORY, not per sub-category — this page renders the category's
    // whole table filtered to one sub, so it needs the same order the
    // category page uses (US-18.2).
    getFactoryOrder(category),
  ]);

  // The one subject line the title, the H1 and the intro all spell — kept
  // identical on purpose, so a page can never advertise itself two ways.
  const subject = subCategorySubject(name, cat.name);

  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'قیمت‌ها', href: routes.prices() },
    { label: cat.name, href: routes.category(category) },
    { label: name, href: routes.subCategory(category, sub) },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      {rows.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            rows.map((r) => ({
              name: r.name,
              url: routes.sku(r.categoryId, r.subCategoryId, r.slug),
            })),
          )}
        />
      )}

      <Section space={10}>
        <Stack gap={6}>
          <div>
            <Breadcrumbs items={crumbs} />
            {/* The H1 and the intro follow the same rule the metadata does:
                with no rows there is no price list, so the page must not
                announce one. Saying «قیمت لحظه‌ای … به تفکیک سایز و کارخانه»
                above an EmptyState is the on-page half of the soft-404 —
                what a crawler reads and what a visitor reads have to agree. */}
            <PriceHeader
              categorySlug={category}
              categoryName={cat.name}
              id="sub-title"
              title={rows.length > 0 ? `قیمت روز ${subject}` : subject}
              description={
                rows.length > 0
                  ? `قیمت لحظه‌ای ${subject} ${
                      factoryIsMeaningful(category, sub)
                        ? 'به تفکیک سایز و کارخانه'
                        : 'به تفکیک سایز'
                    }، همراه با نوسان، وزن شاخه و زمان تحویل اعلام‌شده. پیش از خرید، با کارشناس ما مشورت کنید.`
                  : `هنوز کالایی در ${subject} ثبت نشده است. برای استعلام قیمت، موجودی و زمان تحویل با کارشناسان ما تماس بگیرید.`
              }
            />
          </div>

          {rows.length > 0 ? (
            <>
              <PriceTable
                rows={allRows}
                subs={subs}
                categoryName={cat.name}
                categorySlug={category}
                initialSub={sub}
                vatRate={vatRate}
                factoryOrder={factoryOrder}
              />
              <BulkQuote
                category={category}
                categoryName={cat.name}
                rows={allRows}
                subs={subs}
                logisticsConfig={logisticsConfig}
                vatRate={vatRate}
              />
            </>
          ) : (
            <EmptyState size="section" {...emptyPresets.emptyCategory()} />
          )}
        </Stack>
      </Section>
    </Container>
  );
}
