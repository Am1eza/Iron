import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { PrivacyPageContent } from './PrivacyPageContent';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.privacy');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.privacy() });
}

export default async function PrivacyPage() {
  const [CONTACT, t] = await Promise.all([getContact(), getTranslations()]);
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.privacy.title'), href: routes.privacy() },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="privacy-title">
        <PrivacyPageContent crumbs={crumbs} contact={CONTACT} lastUpdatedDate="مرداد ۱۴۰۵" />
      </Section>
    </Container>
  );
}
