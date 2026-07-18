/** Login route loading — a small centered form shape, not the site-wide
 *  price-table skeleton (US-26.6: that generic fallback was showing on every
 *  route, including this one, which has nothing tabular on it). Mirrors
 *  page.tsx's own centered-stage layout so nothing jumps when it resolves. */
import { Stack, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div
      className="container"
      style={{ display: 'flex', justifyContent: 'center', paddingBlock: 'var(--space-16)' }}
    >
      <span className="visually-hidden" role="status" aria-live="polite">
        در حال بارگذاری…
      </span>
      <div style={{ inlineSize: '100%', maxInlineSize: '360px' }}>
        <Stack gap={4}>
          <Skeleton variant="text" width="50%" height={28} />
          <Skeleton variant="text" width="80%" />
          <div style={{ blockSize: 'var(--space-3)' }} />
          <Skeleton variant="block" height={44} />
          <Skeleton variant="block" height={44} />
        </Stack>
      </div>
    </div>
  );
}
