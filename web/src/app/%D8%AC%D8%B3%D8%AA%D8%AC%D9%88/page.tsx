import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'جستجو', noindex: true });

type Props = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  return (
    <PagePlaceholder
      eyebrow="جستجو"
      title={q ? `نتایج برای «${q}»` : 'جستجو'}
      note="جستجوی محصولات و محتوا (با پیشنهاد و گروه‌بندی) در بخش جستجو ساخته می‌شود."
    />
  );
}
