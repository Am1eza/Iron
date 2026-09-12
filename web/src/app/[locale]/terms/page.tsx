import type { Metadata } from 'next';
import { buildMetadata, ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { TermsPageContent } from './TermsPageContent';

export const metadata: Metadata = buildMetadata({
  title: 'قوانین و مقررات',
  description:
    'قوانین و مقررات استفاده از آهن‌تایم؛ ماهیت خدمات استعلام، قیمت‌ها و ارزش افزوده، ثبت درخواست و تحویل. در آهن‌تایم پرداخت آنلاین وجود ندارد.',
  path: routes.terms(),
});

const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'قوانین و مقررات', href: routes.terms() },
];

export default async function TermsPage() {
  const CONTACT = await getContact();

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10} aria-labelledby="terms-title">
        <TermsPageContent crumbs={crumbs} contact={CONTACT} orgName={ORG_NAME} lastUpdatedDate="تیر ۱۴۰۵" />
      </Section>
    </Container>
  );
}
