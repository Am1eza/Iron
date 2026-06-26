import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/forms/LoginForm';

export const metadata: Metadata = buildMetadata({ title: 'ورود', noindex: true });

export default function LoginPage() {
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-16)', maxInlineSize: 480 }}>
      <h1>ورود به فولادنو</h1>
      <p
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          margin: 'var(--space-3) 0 var(--space-6)',
        }}
      >
        با شمارهٔ موبایل و کد پیامکی وارد شوید.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
