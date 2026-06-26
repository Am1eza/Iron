import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ورود', noindex: true });

export default function LoginPage() {
  return <PagePlaceholder eyebrow="حساب" title="ورود با موبایل و کد پیامکی" note="ورود/ثبت‌نام با موبایل + OTP در بخش حساب ساخته می‌شود." />;
}
