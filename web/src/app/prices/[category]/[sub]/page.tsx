import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ category: string; sub: string }> };

// Prices change intraday (admin-entered) → revalidate often (ROUTING.md §6).
export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub } = await params;
  const subName = decodeURIComponent(sub);
  return buildMetadata({
    title: `قیمت ${subName} امروز`,
    description: `جدول قیمت ${subName} با استاندارد، وزن، نوسان و زمان تحویل.`,
    path: routes.subCategory(category, sub),
  });
}

export default async function SubCategoryPage({ params }: Params) {
  const { sub } = await params;
  return (
    <PagePlaceholder
      eyebrow="قیمت‌ها › دسته › زیر‌دسته"
      title={`جدول قیمت ${decodeURIComponent(sub)}`}
      note="جدول Datasheet (قیمت/نوسان/زمان تحویل + اقدامات) در بخش کاتالوگ ساخته می‌شود."
    />
  );
}
