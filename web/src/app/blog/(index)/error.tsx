'use client';
/**
 * Error boundary for the وبلاگ archive.
 *
 * The listing is the fragile surface: the article DETAIL pages carry a
 * materialised .html and a one-year stale-while-revalidate window, so they
 * keep serving through a Postgres blip, while /blog calls the repo with no
 * try/catch and a dead pool means a 5-second `connectionTimeoutMillis` hang
 * per request and then the generic full-page error. This keeps the failure
 * inside the section, in Persian, with a retry — and, unlike the root
 * boundary, it says which thing failed.
 *
 * A dead pool isn't the only thing that lands here, though: a client-side
 * navigation into /blog also loads this segment's JS chunk, so the weak-
 * connection ChunkLoadError documented in `lib/errors/chunkRecovery` reaches
 * this boundary too — and `reset()` provably cannot recover from it. The
 * hook does the reload-vs-reset branching; the Postgres case is unaffected
 * and still gets a plain `reset()`.
 */
import { useEffect } from 'react';
// Deep imports, NOT the `@/components/ui` barrel — see app/error.tsx.
import { Container } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import { reportError } from '@/lib/errors/report';
import { useChunkRecovery } from '@/lib/errors/chunkRecovery';

export default function BlogError({ error, reset }: { error: Error; reset: () => void }) {
  const { disabled, retryLabel, statusText, retry } = useChunkRecovery(error, reset);

  useEffect(() => {
    reportError(error, { boundary: 'blog-index' });
  }, [error]);

  return (
    <Container>
      <EmptyState
        size="section"
        headline="فهرست مطالب در دسترس نیست"
        // EmptyState already renders this block with role="alert", so
        // swapping the body to the connectivity status announces it without
        // a second live region competing with the first.
        body={statusText || 'مشکلی موقتی پیش آمده است. لطفاً چند لحظه بعد دوباره تلاش کنید.'}
        tone="error"
        primary={{ label: retryLabel, onClick: retry, disabled }}
        showAi
      />
    </Container>
  );
}
