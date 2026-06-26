import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({ title: 'درباره ما', path: routes.about() });

export default function AboutPage() {
  return <PagePlaceholder eyebrow="شرکت" title="درباره آهن‌تایم" note="معرفی، تأمین‌کنندگان و مشتریان در بخش صفحات شرکت ساخته می‌شود." />;
}
