import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata, localBusinessJsonLd } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'تماس با ما',
  description: 'آدرس و شماره‌های تماس پولادین.',
  path: routes.contact(),
});

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd()) }}
      />
      <PagePlaceholder
        eyebrow="شرکت"
        title="تماس با ما"
        note="آدرس: تهران، اقدسیه، خ موحد دانش، پلاک ۱، ط۴، و۷ — ۰۲۱۲۶۲۹۷۵۱۲ / ۰۹۱۲۱۳۹۵۹۵۴ (فرم و نقشه در بخش صفحات شرکت)."
      />
    </>
  );
}
