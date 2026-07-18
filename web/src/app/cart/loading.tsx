/** Cart route loading — a short line-item list, not the full 6-row/5-col
 *  price-table skeleton the site-wide fallback was showing here (US-26.6). */
import { Container, Section, Stack, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Container>
      <Section space={10}>
        <span className="visually-hidden" role="status" aria-live="polite">
          در حال بارگذاری…
        </span>
        <Stack gap={6}>
          <Skeleton variant="text" width="30%" height={28} />
          <Stack gap={3}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="block" height={72} />
            ))}
          </Stack>
          <Skeleton variant="block" height={120} />
        </Stack>
      </Section>
    </Container>
  );
}
