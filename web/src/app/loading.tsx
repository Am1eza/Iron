/** Global route loading — calm skeleton (no blank flash; empty-states anti-flash). */
export default function Loading() {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }} aria-busy="true">
      <span className="visually-hidden">در حال بارگذاری…</span>
      <div
        style={{
          blockSize: 'var(--space-8)',
          inlineSize: '40%',
          background: 'var(--color-hairline)',
          borderRadius: 'var(--radius-sm)',
        }}
      />
      <div
        style={{
          blockSize: 'var(--space-6)',
          inlineSize: '70%',
          background: 'var(--color-hairline)',
          borderRadius: 'var(--radius-sm)',
          marginBlockStart: 'var(--space-4)',
        }}
      />
    </div>
  );
}
