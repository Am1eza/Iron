import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'حساب من', noindex: true });

const TABS: Record<string, string> = {
  'علاقه-مندی': 'علاقه‌مندی‌ها',
  'درخواست-ها': 'درخواست‌ها',
  هشدارها: 'هشدارها',
  پروفایل: 'پروفایل',
  باشگاه: 'باشگاه',
};

type Params = { params: Promise<{ tab?: string[] }> };

export default async function AccountPage({ params }: Params) {
  const { tab } = await params;
  const current = tab?.[0] ? (TABS[decodeURIComponent(tab[0])] ?? 'حساب') : 'حساب من';
  return <PagePlaceholder eyebrow="حساب" title={current} note="داشبورد حساب (علاقه‌مندی/درخواست‌ها/هشدارها/پروفایل/باشگاه) در بخش حساب ساخته می‌شود." />;
}
