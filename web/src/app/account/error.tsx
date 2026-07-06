'use client';
/** Account segment error boundary — recover the account area without dropping
 *  the whole app shell. */
import { useEffect } from 'react';
import { Container, EmptyState, emptyPresets } from '@/components/ui';
import { reportError } from '@/lib/errors/report';

export default function AccountError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'account-error' });
  }, [error]);

  return (
    <Container>
      <EmptyState size="section" {...emptyPresets.serverError(reset)} />
    </Container>
  );
}
