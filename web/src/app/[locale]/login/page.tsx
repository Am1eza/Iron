import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { LoginForm } from '@/components/forms/LoginForm';
import styles from '@/components/forms/LoginForm.module.css';

export const metadata: Metadata = buildMetadata({ title: 'ورود', noindex: true });

export default function LoginPage() {
  // The form is a self-contained card with its own title/subtitle — the page is
  // just a centered stage for it (no duplicate heading, no mixed fonts).
  return (
    <div
      className="container"
      style={{ display: 'flex', justifyContent: 'center', paddingBlock: 'var(--space-16)' }}
    >
      {/* `<Suspense>` with NO fallback renders nothing at all while the boundary
          is suspended — LoginForm reads useSearchParams(), so on a cold visit
          to /login the ONLY thing on the page was empty space until hydration
          finished. On a slow Iranian mobile connection that is a blank white
          screen on the site's sign-in page, which reads as broken. The
          fallback keeps the card's real frame and reserves the form's height,
          so nothing shifts when the real form swaps in (CLS), and announces
          itself as a loading region rather than being invisible to a screen
          reader. panel-login already did this; /login was the one left out. */}
      <Suspense
        fallback={
          <div className={styles.card} role="status" aria-label="در حال بارگذاری فرم ورود">
            <div className={styles.skeleton} />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
