'use client';
import { useTranslations } from 'next-intl';

/**
 * The translated half of `/request`'s H1 + subtitle. `page.tsx` stays a
 * Server Component (needed for `requireUser`'s auth redirect) and passes
 * down only the resolved `userLabel` string (name or mobile, plain data —
 * no functions), matching the split used across this session's other thin
 * page-shell wrappers.
 */
export function RequestPageHeading({ userLabel }: { userLabel: string }) {
  const t = useTranslations('requestPage');
  return (
    <>
      <h1 style={{ marginBlockEnd: 'var(--space-2)' }}>{t('title')}</h1>
      <p
        style={{
          font: 'var(--t-body-sm)',
          color: 'var(--color-text-muted)',
          margin: '0 0 var(--space-8)',
        }}
      >
        {t('subtitle', { user: userLabel })}
      </p>
    </>
  );
}
