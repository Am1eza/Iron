'use client';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui';
import { routes } from '@/lib/routes';

/** Mock-mode-only club tab for a signed-in user (no live club data to show). */
export function ClubGuestEmptyState() {
  const t = useTranslations('account.tabs');
  return (
    <EmptyState
      size="section"
      headline={t('clubGuestHeadline')}
      body={t('clubGuestBody')}
      primary={{ label: t('clubGuestCta'), href: routes.club() }}
    />
  );
}
