'use client';
import { Button } from '@/components/primitives/Button';

/** Reusable scoped error UI (a widget/section failed) — Persian, with retry. No dead-ends. */
export function ErrorState({
  title = 'مشکلی پیش اومد',
  message = 'چند لحظه دیگر دوباره تلاش کنید.',
  onRetry,
  compact = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
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
        <Button variant="ghost" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}
