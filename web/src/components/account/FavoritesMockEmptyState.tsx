'use client';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { emptyPresets } from '@/components/ui/emptyPresets';

/**
 * The translated half of the favorites tab's mock-mode placeholder (rendered
 * only when `API_MODE !== 'live'` — the real, query-backed `FavoritesList`
 * takes over in production) — split out, same as `ClubGuestEmptyState.tsx`,
 * so the account page shell can stay a Server Component.
 */
export function FavoritesMockEmptyState() {
  const t = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');
  return <EmptyState size="section" {...emptyPresets.favoritesEmpty(t, tAction)} />;
}
