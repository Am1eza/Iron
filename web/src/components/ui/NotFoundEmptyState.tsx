'use client';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchOffIcon } from '@/components/primitives/icons';

/**
 * The translated half of the 404 page — split out of `app/not-found.tsx`
 * itself (which stays a server component so it can keep exporting
 * `metadata`; a 'use client' module can't). Built inline rather than via
 * `emptyPresets.notFound()`, which stays Persian-only — see the i18n audit's
 * hardcoded-string inventory for the other 12 presets in that file, all
 * still untranslated and out of this pass's scope — so this specific,
 * very-first-impression page actually translates.
 */
export function NotFoundEmptyState() {
  const t = useTranslations('common.notFound');
  const tAction = useTranslations('common.action');
  return (
    <EmptyState
      size="full"
      glyph={<SearchOffIcon size={56} />}
      headline={t('headline')}
      body={t('body')}
      primary={{ label: tAction('backHome'), href: routes.home() }}
      secondary={{ label: tAction('viewPrices'), href: routes.prices() }}
      showAi
    />
  );
}
