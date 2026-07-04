/** 404 — branded, no dead-ends (empty-states catalog §5). */
import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import { EmptyState } from '@/components/ui';
import { emptyPresets } from '@/components/ui';

export const metadata: Metadata = {
  title: 'صفحه پیدا نشد',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <Container>
      <EmptyState size="full" {...emptyPresets.notFound()} />
    </Container>
  );
}
