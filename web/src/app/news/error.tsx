'use client';
/**
 * Section error boundary for the اخبار بازار archive.
 *
 * The listing is the fragile surface: the article DETAIL pages carry a
 * materialised .html and a one-year stale-while-revalidate window, so they
 * keep serving through a Postgres blip, while /news calls the repo with no
 * try/catch and a dead pool means a 5-second `connectionTimeoutMillis` hang
 * per request and then the generic full-page error. This keeps the failure
 * inside the section, in Persian, with a retry — and, unlike the root
 * boundary, it says which thing failed.
 */
import { useEffect } from 'react';
// Deep imports, NOT the `@/components/ui` barrel — see app/error.tsx.
import { Container } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import { reportError } from '@/lib/errors/report';

export default function NewsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'news-index' });
  }, [error]);

  return (
    <Container>
      <EmptyState
        size="section"
        headline="فهرست اخبار در دسترس نیست"
        body="مشکلی موقتی پیش آمده است. لطفاً چند لحظه بعد دوباره تلاش کنید."
        tone="error"
        primary={{ label: 'تلاش دوباره', onClick: reset }}
        showAi
      />
    </Container>
  );
}
