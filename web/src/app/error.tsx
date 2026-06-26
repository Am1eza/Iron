'use client';
/** Global error boundary — Persian, retry, no English/stack (empty-states §7). */
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // TODO: report to monitoring (server-side) — never surface the raw error to users.
    console.error(error);
  }, [error]);

  return (
    <div
      className="container"
      style={{ paddingBlock: 'var(--space-24)', textAlign: 'center', maxInlineSize: 480 }}
    >
      <h1>مشکلی پیش اومد</h1>
      <p
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          marginBlockStart: 'var(--space-3)',
        }}
      >
        از طرف ما بود. چند لحظه دیگر دوباره امتحان کنید.
      </p>
      <button
        type="button"
        onClick={reset}
        className="spark"
        style={{
          marginBlockStart: 'var(--space-6)',
          font: 'var(--t-button)',
          color: 'var(--color-on-action)',
          background: 'var(--color-action)',
          border: 0,
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-3) var(--space-6)',
          cursor: 'pointer',
        }}
      >
        تلاش دوباره
      </button>
    </div>
  );
}
