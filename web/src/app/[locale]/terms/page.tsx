import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TermsPageContent } from './TermsPageContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('meta.terms');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.terms() });
}


export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [CONTACT, t] = await Promise.all([getContact(), getTranslations()]);
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.terms.title'), href: routes.terms() },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="terms-title">
        <TermsPageContent crumbs={crumbs} contact={CONTACT} orgName={ORG_NAME} lastUpdatedDate="تیر ۱۴۰۵" />
      </Section>
    </Container>
  );
}
