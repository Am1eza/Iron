import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { categories } from '@/lib/mock/fixtures';

type Params = { params: Promise<{ category: string }> };

export async function generateStaticParams() {
  return categories.filter((c) => c.isActive).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const cat = categories.find((c) => c.slug === category);
  const name = cat?.name ?? decodeURIComponent(category);
  return buildMetadata({
    title: `قیمت روز ${name}`,
    description: `قیمت روز ${name} با نوسان و زمان تحویل در پولادین.`,
    path: routes.category(category),
  });
}

export default async function CategoryPage({ params }: Params) {
  const { category } = await params;
  const cat = categories.find((c) => c.slug === category);
  return (
    <PagePlaceholder
      eyebrow="قیمت‌ها › دسته"
      title={`قیمت ${cat?.name ?? decodeURIComponent(category)}`}
      note="زیر‌دسته‌ها و جدول قیمت (Datasheet) در بخش کاتالوگ ساخته می‌شوند."
    />
  );
}
