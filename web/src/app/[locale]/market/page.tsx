import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { getArticle } from '@/lib/server/catalog';
import { MarketPageContent } from './MarketPageContent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.market');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.market() });
}

// Category list is admin-curated and rarely changes, but without a revalidate
// window this page would otherwise cache forever after build (no
// revalidatePath call exists for category admin writes yet).
export const revalidate = 300;

/** The one published article that actually walks through how دلار moves a
 *  finished-product price (سازوکار قیمت ورق) — closest existing match to
 *  this page's own subject until a piece written specifically for the
 *  دلار/طلا/شمش board itself exists. Missing in mock mode / a fresh DB is a
 *  normal state, not an error, so the section below just doesn't render. */
const RELATED_ARTICLE_SLUG = 'عوامل-موثر-بر-قیمت-ورق-فولادی';

export default async function MarketPage() {
  const [relatedArticle, t] = await Promise.all([getArticle(RELATED_ARTICLE_SLUG), getTranslations()]);
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.market.title'), href: routes.market() },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <MarketPageContent crumbs={crumbs} relatedArticle={relatedArticle ?? null} />
      </Section>
    </Container>
  );
}
