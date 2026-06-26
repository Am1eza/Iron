import type { Metadata } from 'next';

/** Admin shell — always noindex; role-gated (auth enforced in middleware/layout when auth ships). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // TODO (auth section): verify session + role here; redirect to /ورود if unauthorized.
  return (
    <div data-area="admin" style={{ minBlockSize: '100svh', background: 'var(--color-surface)' }}>
      {children}
    </div>
  );
}
