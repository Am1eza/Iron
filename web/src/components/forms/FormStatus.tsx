'use client';

/** Inline form status banner — success (status) / error (alert). Persian, tokenized. */
export function FormStatus({
  variant,
  children,
}: {
  variant: 'success' | 'error';
  children: React.ReactNode;
}) {
  const isError = variant === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      style={{
        font: 'var(--t-body-sm)',
        color: isError ? 'var(--color-loss-text)' : 'var(--color-gain-text)',
        background: isError ? 'var(--loss-50)' : 'var(--gain-50)',
        border: `var(--border-hairline) solid ${isError ? 'var(--loss-100)' : 'var(--gain-100)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-3) var(--space-4)',
        marginBlockEnd: 'var(--space-4)',
      }}
    >
      {children}
    </p>
  );
}
