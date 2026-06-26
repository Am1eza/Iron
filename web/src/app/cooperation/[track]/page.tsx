import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { CooperationForm } from '@/components/forms/CooperationForm';
import type { CooperationValues } from '@/lib/validation/schemas';

const TRACKS: Record<string, string> = {
  analysis: 'تحلیل بازار',
  supply: 'تأمین از شما',
  sell: 'فروش از ما',
};

type Params = { params: Promise<{ track: string }> };

export async function generateStaticParams() {
  return Object.keys(TRACKS).map((track) => ({ track }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { track } = await params;
  const name = TRACKS[track] ?? 'همکاری';
  return buildMetadata({ title: name, path: `/cooperation/${track}` });
}

export default async function CooperationTrackPage({ params }: Params) {
  const { track } = await params;
  const name = TRACKS[track];
  if (!name) notFound();

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      <p style={{ font: 'var(--t-overline)', color: 'var(--color-text-muted)' }}>همکاری با ما</p>
      <h1 style={{ marginBlock: 'var(--space-2) var(--space-6)' }}>{name}</h1>
      <CooperationForm track={track as CooperationValues['track']} />
    </div>
  );
}
