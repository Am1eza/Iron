import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { AdvisorChat } from '@/components/ai/AdvisorChat';

export const metadata: Metadata = buildMetadata({
  title: 'مشاور هوشمند آهن‌تایم — اول مشورت، بعد خرید',
  description: 'از آهن‌تایم بپرسید؛ اول می‌پرسد برای چه کاری، بعد مقدار، وزن و هزینهٔ پروژه را حساب می‌کند.',
  path: routes.ai(),
});

type Search = { searchParams: Promise<{ q?: string }> };

export default async function AiPage({ searchParams }: Search) {
  const { q } = await searchParams;
  return <AdvisorChat initialQuestion={typeof q === 'string' ? q : undefined} />;
}
