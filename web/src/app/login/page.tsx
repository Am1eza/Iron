import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/forms/LoginForm';

export const metadata: Metadata = buildMetadata({ title: 'ورود', noindex: true });

export default function LoginPage() {
  // The form is a self-contained card with its own title/subtitle — the page is
  // just a centered stage for it (no duplicate heading, no mixed fonts).
  return (
    <div
      className="container"
      style={{ display: 'flex', justifyContent: 'center', paddingBlock: 'var(--space-16)' }}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
