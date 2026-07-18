/** AI advisor route loading — a chat-bubble shape, not a price table. This is
 *  the product's flagship page (EP-04); the generic table skeleton it was
 *  falling back to made no sense here (US-26.6). */
import { Container, Section, Stack, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Container width="narrow">
      <Section space={10}>
        <span className="visually-hidden" role="status" aria-live="polite">
          در حال بارگذاری…
        </span>
        <Stack gap={4}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Skeleton variant="circle" width={32} height={32} />
            <Skeleton variant="block" width="70%" height={48} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <Skeleton variant="block" width="45%" height={36} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Skeleton variant="circle" width={32} height={32} />
            <Skeleton variant="block" width="55%" height={72} />
          </div>
        </Stack>
      </Section>
    </Container>
  );
}
