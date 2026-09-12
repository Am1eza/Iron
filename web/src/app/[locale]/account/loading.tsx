/** Account route loading — a profile/list shape, not the site-wide
 *  price-table skeleton (this was the story's own motivating example:
 *  US-26.6). Shared by every tab under `[[...tab]]` (favorites, alerts,
 *  orders, ...) that doesn't define its own loading.tsx. */
import { Container, Section, Stack, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Container>
      <Section space={10}>
        <span className="visually-hidden" role="status" aria-live="polite">
          در حال بارگذاری…
        </span>
        <Stack gap={5}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Skeleton variant="circle" width={56} height={56} />
            <div>
              <Skeleton variant="text" width={140} height={22} />
              <div style={{ blockSize: 'var(--space-1)' }} />
              <Skeleton variant="text" width={100} />
            </div>
          </div>
          <Stack gap={2}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="block" height={56} />
            ))}
          </Stack>
        </Stack>
      </Section>
    </Container>
  );
}
