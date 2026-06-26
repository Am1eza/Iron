import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({ title: 'حریم خصوصی', path: routes.privacy() });

export default function PrivacyPage() {
  return <PagePlaceholder eyebrow="حقوقی" title="حریم خصوصی" note="سیاست حریم خصوصی در بخش صفحات حقوقی ساخته می‌شود." />;
}
