import type { Metadata } from 'next';
import { buildMetadata, localBusinessJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ContactCard } from '@/components/company/ContactCard';
import { ContactIntro } from '@/components/company/ContactIntro';
import { ContactForm } from '@/components/forms/ContactForm';

export const metadata: Metadata = buildMetadata({
  title: 'تماس با ما',
  description:
    'آدرس دفتر، شماره تماس ثابت و همراه آهن‌تایم و فرم ارسال پیام؛ برای مشاوره، استعلام قیمت یا همکاری با ما در تماس باشید.',
  path: routes.contact(),
});

/** Crumb labels for BreadcrumbList only — the visible, translated breadcrumbs
 *  are rendered by `ContactIntro`. */
const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'تماس با ما', href: routes.contact() },
];

export default function ContactPage() {
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
