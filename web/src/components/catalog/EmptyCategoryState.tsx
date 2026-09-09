'use client';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { emptyPresets } from '@/components/ui/emptyPresets';

/**
 * The translated half of the category/sub-category "no SKUs yet" state —
 * split out so `prices/[category]/page.tsx`/`[sub]/page.tsx` (Server
 * Components, needed for `generateMetadata` + fa breadcrumbs) can render it
 * without themselves needing `useTranslations`. Same split as
 * `NotFoundEmptyState.tsx`.
 */
export function EmptyCategoryState() {
  const t = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');
  return <EmptyState size="section" {...emptyPresets.emptyCategory(t, tAction)} />;
}
