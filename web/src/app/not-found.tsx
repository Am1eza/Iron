/** 404 — branded, no dead-ends (empty-states catalog §5).
 *  Redirect enforcement (US-14.3) deliberately does NOT live here: the root
 *  `not-found.tsx` gets statically pre-rendered at build time in this
 *  Next.js version (confirmed by inspecting `.next/server/app/_not-found.html`
 *  in the built image) regardless of using dynamic APIs like `headers()`, so
 *  per-request logic placed here silently never runs for a genuinely
 *  unmatched path. See proxy.ts instead, which does run per-request. */
import type { Metadata } from 'next';
// Deep imports, NOT the `@/components/ui` barrel: the package has no
// `sideEffects: false`, so touching the barrel keeps every 'use client'
// member of it (Modal, Tabs, Tooltip, useConfirm, …) — plus their CSS —
// in the bundle. Error boundaries and the homepage price board are on
// the first-load critical path, so that cost is paid by every visitor.
import { Container } from '@/components/ui/Layout';
import { NotFoundEmptyState } from '@/components/ui/NotFoundEmptyState';
import { SearchBar } from '@/components/layout/SearchBar';
import styles from './not-found.module.css';

export const metadata: Metadata = {
  title: 'صفحه پیدا نشد',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <Container>
      {/* Translated EmptyState split into its own 'use client' component
          (NotFoundEmptyState) — this file stays a server component
          specifically so it can keep exporting `metadata` above, which a
          'use client' module cannot do. */}
      <NotFoundEmptyState />
      {/* The preset copy says "get help from search" but nothing on the page
          could actually be searched (audit finding) — a real, working field
          instead of a promise the page didn't keep. */}
      <div className={styles.search}>
        <SearchBar size="lg" autoFocus />
      </div>
    </Container>
  );
}
