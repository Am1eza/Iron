import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { getArticle } from '@/lib/server/catalog';
import { MarketPageContent } from './MarketPageContent';

export const metadata: Metadata = buildMetadata({
  title: 'طلا، ارز و شمش فولاد',
  description:
    'نرخ لحظه‌ای دلار، یورو، طلای ۱۸ عیار، انس جهانی و شمش فولاد در آهن‌تایم: همان متغیرهایی که قیمت روز آهن‌آلات را جابه‌جا می‌کنند.',
  path: routes.market(),
});

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'طلا، ارز و شمش', href: routes.market() },
];

/** The one published article that actually walks through how دلار moves a
 *  finished-product price (سازوکار قیمت ورق) — closest existing match to
 *  this page's own subject until a piece written specifically for the
 *  دلار/طلا/شمش board itself exists. Missing in mock mode / a fresh DB is a
 *  normal state, not an error, so the section below just doesn't render. */
const RELATED_ARTICLE_SLUG = 'عوامل-موثر-بر-قیمت-ورق-فولادی';

export default async function MarketPage() {
  const relatedArticle = await getArticle(RELATED_ARTICLE_SLUG);

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <MarketPageContent crumbs={crumbs} relatedArticle={relatedArticle ?? null} />
      </Section>
    </Container>
  );
}
