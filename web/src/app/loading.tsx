/** Global route loading — calm skeleton (no blank flash; empty-states anti-flash §6). */
import { Container, Section, Stack, Skeleton, TableSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Container>
      <Section space={16}>
        <span className="visually-hidden" role="status" aria-live="polite">
          در حال بارگذاری…
        </span>
        <Stack gap={4}>
          <Skeleton variant="text" width="40%" height={28} />
          <Skeleton variant="text" width="65%" />
          <div style={{ blockSize: 'var(--space-4)' }} />
          <TableSkeleton rows={6} cols={5} />
        </Stack>
      </Section>
    </Container>
  );
}
