import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'وبلاگ',
  description: 'راهنمای خرید و تحلیل بازار آهن و فولاد.',
  path: routes.blog(),
});

export default function BlogPage() {
  return <PagePlaceholder eyebrow="محتوا" title="وبلاگ پولادین" note="فهرست مطالب در بخش محتوا ساخته می‌شود." />;
}
