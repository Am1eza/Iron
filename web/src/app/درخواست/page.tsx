import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ثبت درخواست', noindex: true });

export default function RequestPage() {
  return <PagePlaceholder eyebrow="استعلام" title="ثبت درخواست" note="فلوی درخواست → OTP → پیش‌فاکتور → CRM در بخش تجارت ساخته می‌شود." />;
}
