import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({ title: 'چرا آهن‌تایم؟', path: routes.why() });

export default function WhyPage() {
  return <PagePlaceholder eyebrow="شرکت" title="چرا آهن‌تایم؟" note="مزیت‌های رقابتی (شفافیت، تحویل تضمینی، مشاور هوشمند، سرعت) در بخش صفحات شرکت ساخته می‌شود." />;
}
