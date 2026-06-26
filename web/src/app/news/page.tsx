import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'اخبار بازار',
  description: 'اخبار لحظه‌ای بازار آهن و فولاد.',
  path: routes.news(),
});

export default function NewsPage() {
  return <PagePlaceholder eyebrow="محتوا" title="اخبار بازار" note="فهرست اخبار در بخش محتوا ساخته می‌شود." />;
}
