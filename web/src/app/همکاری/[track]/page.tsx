import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/dev/PagePlaceholder';
import { buildMetadata } from '@/lib/seo';

const TRACKS: Record<string, string> = {
  'تحلیل-بازار': 'تحلیل بازار',
  تامین: 'تأمین از شما',
  فروش: 'فروش از ما',
};

type Params = { params: Promise<{ track: string }> };

export async function generateStaticParams() {
  return Object.keys(TRACKS).map((track) => ({ track }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { track } = await params;
  const name = TRACKS[decodeURIComponent(track)] ?? 'همکاری';
  return buildMetadata({ title: name, path: `/همکاری/${track}` });
}

export default async function CooperationTrackPage({ params }: Params) {
  const { track } = await params;
  const name = TRACKS[decodeURIComponent(track)];
  if (!name) notFound();
  return <PagePlaceholder eyebrow="همکاری" title={name} note="فرم لید این مسیر در بخش همکاری ساخته می‌شود." />;
}
