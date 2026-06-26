import type { Metadata } from 'next';
import { buildMetadata, localBusinessJsonLd, CONTACT } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { ContactForm } from '@/components/forms/ContactForm';
import { toPersianDigits } from '@/lib/utils/format';

export const metadata: Metadata = buildMetadata({
  title: 'تماس با ما',
  description: 'آدرس و شماره‌های تماس آهن‌تایم.',
  path: routes.contact(),
});

export default function ContactPage() {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd()) }}
      />
      <h1>تماس با ما</h1>
      <address
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          fontStyle: 'normal',
          margin: 'var(--space-3) 0 var(--space-8)',
        }}
      >
        {CONTACT.address}
        <br />
        تلفن: <bdi>{toPersianDigits(CONTACT.phoneLandline)}</bdi> ·{' '}
        <a href={`tel:${CONTACT.phoneMobile}`}>
          <bdi>{toPersianDigits(CONTACT.phoneMobile)}</bdi>
        </a>
      </address>
      <ContactForm />
    </div>
  );
}
