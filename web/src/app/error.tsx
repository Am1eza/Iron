'use client';
/** Global error boundary — Persian, retry, no English/stack (empty-states §7). */
import { useEffect } from 'react';
import { Container, EmptyState, emptyPresets } from '@/components/ui';
import { reportError } from '@/lib/errors/report';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'route-error' });
  }, [error]);

  return (
    <Container>
      <EmptyState size="full" {...emptyPresets.serverError(reset)} />
    </Container>
  );
}
