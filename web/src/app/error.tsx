'use client';
/** Global error boundary — Persian, retry, no English/stack (empty-states §7). */
import { useEffect } from 'react';
// Deep imports, NOT the `@/components/ui` barrel: the package has no
// `sideEffects: false`, so touching the barrel keeps every 'use client'
// member of it (Modal, Tabs, Tooltip, useConfirm, …) — plus their CSS —
// in the bundle. Error boundaries and the homepage price board are on
// the first-load critical path, so that cost is paid by every visitor.
import { Container } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import { emptyPresets } from '@/components/ui/emptyPresets';
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
