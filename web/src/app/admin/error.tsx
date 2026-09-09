'use client';
/** Admin segment error boundary — keeps the admin shell (nav) intact and lets
 *  the operator retry just the failed panel instead of losing the whole page. */
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, emptyPresets } from '@/components/ui';
import { reportError } from '@/lib/errors/report';

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');

  useEffect(() => {
    reportError(error, { boundary: 'admin-error' });
  }, [error]);

  return <EmptyState size="section" {...emptyPresets.serverError(t, tAction, reset)} />;
}
