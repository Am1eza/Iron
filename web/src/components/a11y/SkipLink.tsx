'use client';
import { useTranslations } from 'next-intl';

/**
 * Rendered inside `LocaleProvider` (unlike the rest of the pre-hydration
 * shell in `app/layout.tsx`) specifically so it re-renders with the visitor's
 * actual locale — a plain `faMessages.common.skipToContent` reference at the
 * body root stayed Persian forever, even after the page itself switched to
 * English/Arabic/Chinese, because it lived outside the provider whose
 * `messages` state is what changes on locale switch.
 */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a href="#main" className="skip-link">
      {t('skipToContent')}
    </a>
  );
}
