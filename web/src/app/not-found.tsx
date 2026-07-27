/** 404 — branded, no dead-ends (empty-states catalog §5).
 *  Redirect enforcement (US-14.3) deliberately does NOT live here: the root
 *  `not-found.tsx` gets statically pre-rendered at build time in this
 *  Next.js version (confirmed by inspecting `.next/server/app/_not-found.html`
 *  in the built image) regardless of using dynamic APIs like `headers()`, so
 *  per-request logic placed here silently never runs for a genuinely
 *  unmatched path. See middleware.ts instead, which does run per-request. */
import type { Metadata } from 'next';
// Deep imports, NOT the `@/components/ui` barrel: the package has no
// `sideEffects: false`, so touching the barrel keeps every 'use client'
// member of it (Modal, Tabs, Tooltip, useConfirm, …) — plus their CSS —
// in the bundle. Error boundaries and the homepage price board are on
// the first-load critical path, so that cost is paid by every visitor.
import { Container } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import { emptyPresets } from '@/components/ui/emptyPresets';

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
