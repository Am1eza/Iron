import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

type Params = { params: Promise<{ category: string; sub: string; sku: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, sub, sku } = await params;
  const name = decodeURIComponent(sku).replace(/-/g, ' ');
  return buildMetadata({
    title: `قیمت ${name} امروز`,
    description: `قیمت روز ${name}، وزن، نوسان و زمان تحویل در پولادین.`,
    path: routes.sku(category, sub, sku),
  });
}

export default async function SkuPage({ params }: Params) {
  const { sku } = await params;
  // Live build: const row = await getSku(sku); if (!row) notFound();
  return (
    <PagePlaceholder
      eyebrow="قیمت‌ها › … › محصول"
      title={decodeURIComponent(sku).replace(/-/g, ' ')}
      note="صفحهٔ SKU: قیمت هیرو + نمودار + مشخصات + «قیمت ما vs قیمت پایه» + Product/Offer schema."
    />
  );
}

export function generateStaticParams() {
  return [
    { category: 'rebar', sub: 'ajdar', sku: 'rebar-14-a3-zob' },
    { category: 'rebar', sub: 'ajdar', sku: 'rebar-16-a3-zob' },
  ];
}
