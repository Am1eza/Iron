import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';
import { routes } from '@/lib/routes';

export const metadata: Metadata = buildMetadata({
  title: 'فولادنو — مشاور هوشمند خرید آهن و فولاد',
  description: 'از فولادنو بپرسید؛ اول مشورت، بعد خرید. برآورد پروژه، وزن و قیمت.',
  path: routes.ai(),
});

export default function AiPage() {
  return <PagePlaceholder eyebrow="دستیار هوشمند" title="فولادنو" note="تجربهٔ کامل گفتگو و برآورد در بخش هوش مصنوعی ساخته می‌شود." />;
}
