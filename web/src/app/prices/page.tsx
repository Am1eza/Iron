import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'قیمت روز آهن و فولاد',
  description: 'قیمت روز میلگرد، تیرآهن، پروفیل، ورق و سایر مقاطع فولادی در پولادین.',
  path: routes.prices(),
});

export default function PriceHubPage() {
  return <PagePlaceholder eyebrow="قیمت‌ها" title="قیمت روز آهن و فولاد" note="فهرست دسته‌ها و جدول‌های قیمت در بخش کاتالوگ ساخته می‌شود." />;
}
