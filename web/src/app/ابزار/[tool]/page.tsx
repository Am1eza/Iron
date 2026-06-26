import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

const TOOLS: Record<string, string> = {
  وزن: 'وزن‌سنج',
  'براورد-پروژه': 'پروژه‌سنج',
  'محاسبه-هزینه': 'محاسبه‌گر هزینه',
};

type Params = { params: Promise<{ tool: string }> };

export async function generateStaticParams() {
  return Object.keys(TOOLS).map((tool) => ({ tool }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tool } = await params;
  const name = TOOLS[decodeURIComponent(tool)] ?? 'ابزار';
  return buildMetadata({ title: `${name} آنلاین`, path: `/ابزار/${tool}` });
}

export default async function ToolPage({ params }: Params) {
  const { tool } = await params;
  const name = TOOLS[decodeURIComponent(tool)];
  if (!name) notFound();
  return <PagePlaceholder eyebrow="ابزارها" title={name} note="ابزار محاسبه در بخش ابزارها ساخته می‌شود." />;
}
