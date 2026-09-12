import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata, orgJsonLd, ORG_NAME } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ContactCard } from '@/components/company/ContactCard';
import { AboutContent } from '@/components/company/AboutContent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.about');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.about() });
}

/**
 * «درباره ما» — the company page, carrying the «چرا آهن‌تایم؟» advantages merged
 * in from the former standalone /why page (now redirected here).
 *
 * The visible copy lives in `AboutContent` (a Client Component reading the
 * `about` dictionary) so it follows the client-side locale switch. The route
 * `metadata` and the breadcrumb JSON-LD below are locale-aware too (I-08:
 * real per-locale URLs now exist under `[locale]`, so a crawler indexing
 * `/en/about` must see English, not fa).
 */
export default async function AboutPage() {
  const t = await getTranslations();
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.about.title'), href: routes.about() },
  ];
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd data={orgJsonLd()} />

      <Section space={10} aria-labelledby="about-title">
        {/* ContactCard is an async Server Component — rendered here and passed
            down as a slot, since a Client Component cannot render one. */}
        <AboutContent orgName={ORG_NAME} contactCard={<ContactCard />} />
      </Section>
    </Container>
  );
}
