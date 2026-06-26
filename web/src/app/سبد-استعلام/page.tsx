import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'سبد استعلام', noindex: true });

export default function CartPage() {
  return <PagePlaceholder eyebrow="استعلام" title="سبد استعلام" note="سبد چند‌محصولی و تبدیل به پیش‌فاکتور در بخش تجارت ساخته می‌شود." />;
}
