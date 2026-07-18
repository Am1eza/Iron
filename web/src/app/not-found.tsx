/** 404 — branded, no dead-ends (empty-states catalog §5).
 *  Redirect enforcement (US-14.3) deliberately does NOT live here: the root
 *  `not-found.tsx` gets statically pre-rendered at build time in this
 *  Next.js version (confirmed by inspecting `.next/server/app/_not-found.html`
 *  in the built image) regardless of using dynamic APIs like `headers()`, so
 *  per-request logic placed here silently never runs for a genuinely
 *  unmatched path. See middleware.ts instead, which does run per-request. */
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
