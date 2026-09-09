'use client';
/** Account segment error boundary — recover the account area without dropping
 *  the whole app shell. */
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Container, EmptyState, emptyPresets } from '@/components/ui';
import { reportError } from '@/lib/errors/report';

export default function AccountError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('emptyPresets');
  const tAction = useTranslations('common.action');

  useEffect(() => {
    reportError(error, { boundary: 'account-error' });
  }, [error]);

  return (
    <Container>
      <EmptyState size="section" {...emptyPresets.serverError(t, tAction, reset)} />
    </Container>
  );
}
