import type { ReactNode } from 'react';
import { ChartIcon, TagIcon, StarIcon } from '@/components/primitives/icons';

/**
 * The three همکاری tracks — the single source of truth for the route key
 * and icon per track. Every VISIBLE string (title, summary, audience, cta,
 * eyebrow, lead, points, formNote, metaDescription) lives in the
 * `cooperation.tracks.${key}.*` translation namespace instead, across all
 * four locales — see `CooperationPageContent`/`CooperationTrackContent`
 * (the page copy) and `[track]/page.tsx`'s `generateMetadata` (the <title>/
 * description). This file only carries what genuinely isn't text: the
 * route key and the icon node.
 */
export type TrackKey = 'analysis' | 'supply' | 'sell';

export type TrackContent = {
  key: TrackKey;
  /** Icon for the card + track header. */
  icon: ReactNode;
};

export const TRACKS: Record<TrackKey, TrackContent> = {
  analysis: { key: 'analysis', icon: <ChartIcon size={24} /> },
  supply: { key: 'supply', icon: <TagIcon size={24} /> },
  sell: { key: 'sell', icon: <StarIcon size={24} /> },
};

export const TRACK_ORDER: TrackKey[] = ['analysis', 'supply', 'sell'];

export function isTrackKey(value: string): value is TrackKey {
  return value === 'analysis' || value === 'supply' || value === 'sell';
}
