import type { Metadata } from 'next';
import { buildMetadata, localBusinessJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section, Stack, Breadcrumbs } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/company/PageHero';
import { ContactCard } from '@/components/company/ContactCard';
import { ContactForm } from '@/components/forms/ContactForm';

export const metadata: Metadata = buildMetadata({
  title: 'تماس با ما',
  description:
    'آدرس دفتر، شماره تماس ثابت و همراه آهن‌تایم و فرم ارسال پیام؛ برای مشاوره، استعلام قیمت یا همکاری با ما در تماس باشید.',
  path: routes.contact(),
});

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'تماس با ما' },
];

export default function ContactPage() {
  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />
      <JsonLd data={localBusinessJsonLd()} />

      <Section space={10} aria-labelledby="contact-title">
        <Stack gap={8}>
          <Stack gap={6}>
            <Breadcrumbs items={crumbs} />
            <PageHero
              id="contact-title"
              eyebrow="در ارتباط باشید"
              title="تماس با ما"
              lead="برای مشاوره پیش از خرید، استعلام قیمت یا هر پرسش دیگری، با ما تماس بگیرید یا فرم زیر را پر کنید."
            />
          </Stack>

          <ContactCard />
          <ContactForm />
        </Stack>
      </Section>
    </Container>
  );
}
