import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';
import { AdvisorChat, GREETING_TEXT } from '@/components/ai/AdvisorChat';
import { PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';

export const metadata: Metadata = buildMetadata({
  title: 'مشاور هوشمند آهن‌تایم — اول مشورت، بعد خرید',
  description: 'از آهن‌تایم بپرسید؛ اول می‌پرسد برای چه کاری، بعد مقدار، وزن و هزینهٔ پروژه را حساب می‌کند.',
  path: routes.ai(),
});

type Search = { searchParams: Promise<{ q?: string }> };

export default async function AiPage({ searchParams }: Search) {
  const { q } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q : undefined;
  // Rendered server-side so the advisor's opening message is real, crawlable
  // HTML on first load instead of only appearing after client-side hydration.
  const initialMessages = [
    {
      id: 'greeting',
      role: 'ai' as const,
      text: GREETING_TEXT,
      chips: initialQuestion ? undefined : PURPOSE_CHIPS,
    },
  ];
  return <AdvisorChat initialQuestion={initialQuestion} initialMessages={initialMessages} />;
}
