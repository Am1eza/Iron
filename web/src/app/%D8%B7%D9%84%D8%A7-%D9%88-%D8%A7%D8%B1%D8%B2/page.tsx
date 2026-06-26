import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت لحظه‌ای دلار، یورو و طلا',
  description: 'بازار طلا و ارز به‌صورت لحظه‌ای — و قیمت روز آهن و فولاد در کنار آن.',
  path: routes.market(),
});

export default function MarketPage() {
  return <PagePlaceholder eyebrow="بازار" title="طلا و ارز" note="تابلوی کامل tgju و اتصال به «نبض بازار» در بخش بازار ساخته می‌شود." />;
}
