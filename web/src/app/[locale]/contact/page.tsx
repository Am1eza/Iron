import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildMetadata, localBusinessJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ContactCard } from '@/components/company/ContactCard';
import { ContactIntro } from '@/components/company/ContactIntro';
import { ContactForm } from '@/components/forms/ContactForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('meta.contact');
  return buildMetadata({ title: t('title'), description: t('description'), path: routes.contact() });
}


export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  /** Crumb labels for BreadcrumbList only — the visible, translated breadcrumbs
   *  are rendered by `ContactIntro`. */
  const crumbs = [
    { label: t('nav.home'), href: routes.home() },
    { label: t('meta.contact.title'), href: routes.contact() },
  ];
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd data={localBusinessJsonLd()} />

      <Section space={10} aria-labelledby="contact-title">
        <Stack gap={8}>
          <ContactIntro />

          <ContactCard />
          <ContactForm />
        </Stack>
      </Section>
    </Container>
  );
}
