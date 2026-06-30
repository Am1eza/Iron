'use client';
/**
 * Global error — catches failures in the ROOT layout itself (rare).
 * Must render its own <html>/<body>; tokens/CSS may be unavailable here,
 * so styles are self-contained with literal brand colors.
 */
import { useEffect } from 'react';
import { reportError } from '@/lib/errors/report';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { source: 'global-error' });
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          background: '#F4F7FA',
          color: '#2B333D',
          fontFamily: 'Tahoma, system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ color: '#171C22', fontSize: 28, margin: 0 }}>مشکلی پیش اومد</h1>
          <p style={{ color: '#64707E', marginTop: 12 }}>
            از طرف ما بود. چند لحظه دیگر دوباره امتحان کنید.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              background: '#0F8A63',
              color: '#171C22',
              border: 0,
              borderRadius: 6,
              padding: '12px 24px',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            تلاش دوباره
          </button>
        </div>
      </body>
    </html>
  );
}
