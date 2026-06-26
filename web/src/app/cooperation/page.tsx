import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'همکاری با ما',
  description: 'تحلیل بازار، تأمین از شما، فروش از ما.',
  path: routes.cooperation(),
});

export default function CooperationPage() {
  return <PagePlaceholder eyebrow="همکاری" title="همکاری با ما" note="سه مسیر (تحلیل بازار/تأمین از شما/فروش از ما) با فرم لید در بخش همکاری ساخته می‌شود." />;
}
