import type { Metadata } from 'next';
import { buildMetadata, orgJsonLd, ORG_NAME } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { Container, Section } from '@/components/ui';
import { BreadcrumbJsonLd, JsonLd } from '@/components/seo/JsonLd';
import { ContactCard } from '@/components/company/ContactCard';
import { AboutContent } from '@/components/company/AboutContent';

export const metadata: Metadata = buildMetadata({
  title: 'درباره ما',
  description:
    'آهن‌تایم؛ بازار آنلاین قیمت آهن و فولاد با مشاور هوشمند و تأمین مستقیم از کارخانه: ارزان‌تر با حذف واسطه، تحویل ۲۴ ساعته، قیمت شفاف و پشتیبانی واقعی. اول مشورت، بعد خرید.',
  path: routes.about(),
});

/**
 * «درباره ما» — the company page, carrying the «چرا آهن‌تایم؟» advantages merged
 * in from the former standalone /why page (now redirected here).
 *
 * The visible copy lives in `AboutContent` (a Client Component reading the
 * `about` dictionary) so it follows the client-side locale switch. What stays
 * here is what must be server-side and stays Persian regardless of the visitor's
 * chosen language: the route `metadata` and the JSON-LD. The crumb labels below
 * feed BreadcrumbList only — the VISIBLE breadcrumbs are rendered, translated,
 * inside AboutContent — and stay Persian on purpose, because that is what a
 * crawler sees on this one canonical URL.
 */
const crumbs = [
  { label: 'خانه', href: routes.home() },
  { label: 'درباره ما', href: routes.about() },
];

export default function AboutPage() {
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
