import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { RequestForm } from '@/components/forms/RequestForm';

export const metadata: Metadata = buildMetadata({ title: 'ثبت درخواست', noindex: true });

export default function RequestPage() {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      <p style={{ font: 'var(--t-overline)', color: 'var(--color-text-muted)' }}>استعلام</p>
      <h1 style={{ marginBlock: 'var(--space-2) var(--space-6)' }}>ثبت درخواست</h1>
      <RequestForm />
    </div>
  );
}
