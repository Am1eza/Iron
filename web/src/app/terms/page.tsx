import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({ title: 'قوانین و مقررات', path: routes.terms() });

export default function TermsPage() {
  return <PagePlaceholder eyebrow="حقوقی" title="قوانین و مقررات" note="متن قوانین در بخش صفحات حقوقی ساخته می‌شود." />;
}
