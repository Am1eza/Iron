import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'باشگاه پولادین',
  description: 'مزایای ویژه: قیمت ویژه، تحویل اولویت‌دار، مشاور اختصاصی و هشدارهای ویژه.',
  path: routes.club(),
});

export default function ClubPage() {
  return <PagePlaceholder eyebrow="وفاداری" title="باشگاه پولادین" note="سطوح (آهن/فولاد/پولاد) و مزایا در بخش باشگاه ساخته می‌شود." />;
}
