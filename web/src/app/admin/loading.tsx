/** Admin route loading — a panel shape (heading + toolbar + cards), not the
 *  public price-table skeleton. Renders inside admin/layout.tsx's shell (nav
 *  stays put), and is the shared fallback for every /admin/* sub-page that
 *  doesn't define its own loading.tsx (US-26.6). */
import { Stack, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <Stack gap={5}>
      <span className="visually-hidden" role="status" aria-live="polite">
        در حال بارگذاری…
      </span>
      <div>
        <Skeleton variant="text" width="30%" height={28} />
        <div style={{ blockSize: 'var(--space-2)' }} />
        <Skeleton variant="text" width="55%" />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" width={180} height={88} />
        ))}
      </div>
      <Skeleton variant="block" height={220} />
    </Stack>
  );
}
