'use client';
/** Cart segment error boundary — a failure here must not blank the whole page
 *  mid-checkout; recover just the cart. */
import { useEffect } from 'react';
import { Container, EmptyState, emptyPresets } from '@/components/ui';
import { reportError } from '@/lib/errors/report';

export default function CartError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'cart-error' });
  }, [error]);

  return (
    <Container>
      <EmptyState size="section" {...emptyPresets.serverError(reset)} />
    </Container>
  );
}
