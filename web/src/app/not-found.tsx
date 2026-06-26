/** 404 — branded, no dead-ends (empty-states catalog §5). */
import { Container } from '@/components/ui';
import { EmptyState } from '@/components/ui';
import { emptyPresets } from '@/components/ui';

export default function NotFound() {
  return (
    <Container>
      <EmptyState size="full" {...emptyPresets.notFound()} />
    </Container>
  );
}
