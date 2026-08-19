'use client';
import { Button } from '@/components/primitives/Button';
import { isReloadableError } from '@/lib/errors/chunkRecovery';

/**
 * Reusable scoped error UI (a widget/section failed) — Persian, with retry. No dead-ends.
 *
 * `onRetry` is caller-supplied and, by design, usually knows nothing about the
 * underlying failure (ERROR-HANDLING.md's canonical call site is
 * `onRetry={() => q.refetch()}` on a TanStack Query error). Passing the caught
 * `error` is therefore OPTIONAL and purely additive: without it the component
 * behaves exactly as before, and `onRetry` is invoked verbatim. With it, a
 * weak-connection chunk failure — which a refetch provably cannot recover
 * from, see lib/errors/chunkRecovery — reloads the page instead, which can.
 */
export function ErrorState({
  title = 'مشکلی پیش اومد',
  message = 'چند لحظه دیگر دوباره تلاش کنید.',
  onRetry,
  error,
  compact = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** The caught error, when the caller actually has one. See the note above. */
  error?: Error;
  compact?: boolean;
}) {
  // No hook here on purpose: this renders inline inside a live page, so the
  // auto-reload and online-listener behaviour that suits a full error PAGE
  // would be wrong — it would yank a working page out from under someone
  // because one widget failed. Only the reload-vs-retry branch applies.
  // Gated on `onRetry` as well as `reloadable`: a caller that deliberately
  // passes no retry (a dead-end-free read-only state) must not grow a button
  // just because the error happened to be a chunk failure.
  const reloadable = Boolean(onRetry) && error !== undefined && isReloadableError(error);
  const retry = reloadable ? () => window.location.reload() : onRetry;

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: compact ? 'flex-start' : 'center',
        textAlign: compact ? 'start' : 'center',
        gap: 'var(--space-3)',
        padding: compact ? 'var(--space-4)' : 'var(--space-12)',
        border: 'var(--border-hairline) solid var(--color-hairline)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
      }}
    >
      <strong style={{ font: 'var(--t-h4)', color: 'var(--color-text-strong)' }}>{title}</strong>
      <span style={{ font: 'var(--t-body-sm)', color: 'var(--color-text-muted)' }}>{message}</span>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={retry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}
