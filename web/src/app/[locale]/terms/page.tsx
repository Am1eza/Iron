import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata, ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TermsPageContent } from './TermsPageContent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.terms');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.terms() });
}

export default async function TermsPage() {
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
