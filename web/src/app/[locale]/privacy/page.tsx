import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { PrivacyPageContent } from './PrivacyPageContent';

export const metadata: Metadata = buildMetadata({
  title: 'حریم خصوصی',
  description:
    'سیاست حریم خصوصی آهن‌تایم؛ چه اطلاعاتی جمع‌آوری می‌کنیم، چگونه از آن استفاده می‌کنیم، پردازش گفتگوی مشاور هوشمند، ارسال پیامک از طریق SMS.ir و حقوق شما. ما داده‌های شما را نمی‌فروشیم.',
  path: routes.privacy(),
});

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'حریم خصوصی', href: routes.privacy() },
];

export default async function PrivacyPage() {
  const CONTACT = await getContact();

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="privacy-title">
        <PrivacyPageContent crumbs={crumbs} contact={CONTACT} lastUpdatedDate="مرداد ۱۴۰۵" />
      </Section>
    </Container>
  );
}
