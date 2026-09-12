'use client';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { emptyPresets } from '@/components/ui/emptyPresets';

/**
 * The translated half of the "no search results" state — split out so
 * `search/page.tsx` (a Server Component) can render it without itself
 * needing `useTranslations`. Same split as `NotFoundEmptyState.tsx`. The
 * rest of the search page's own copy is a separate, larger, not-yet-done
 * translation pass (see the market/search batch's report) — this fixes only
 * this one empty-state call site.
 */
export function SearchEmptyState({ q }: { q: string }) {
  const t = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');
  return <EmptyState size="section" {...emptyPresets.searchNoResults(t, tAction, q)} showAi />;
}
