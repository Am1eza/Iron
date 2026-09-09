'use client';
import type { ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { localizeDigits } from '@/lib/utils/format';
import prose from './Prose.module.css';
import styles from './LegalDoc.module.css';

/**
 * LegalDoc — renders a numbered legal document (terms / privacy) as anchored
 * sections with a sticky table of contents. Client component (for the TOC
 * chrome only — `t`/`locale`) fed with data-only props from its Server
 * Component callers (`privacy/page.tsx`/`terms/page.tsx`), which pass
 * `sections`/`updatedLabel` as plain data (no functions). Each section's
 * `id` is a stable ASCII slug for deep-linking; titles/body are the actual
 * legal document prose — real content, deliberately fa-only, out of scope
 * for UI-string translation.
 */
export type LegalSection = {
  /** Stable ASCII anchor id. */
  id: string;
  title: string;
  body: ReactNode;
};

export function LegalDoc({
  sections,
  updatedLabel,
  tocTitle,
}: {
  sections: LegalSection[];
  /** e.g. «آخرین به‌روزرسانی: تیر ۱۴۰۵». */
  updatedLabel?: string;
  tocTitle?: string;
}) {
  const t = useTranslations('legalDoc');
  const locale = useLocale();
  return (
    <div className={styles.layout}>
      <nav className={styles.toc} aria-label={t('tocAriaLabel')}>
        <p className={styles.tocTitle}>{tocTitle ?? t('tocTitle')}</p>
        <ol className={styles.tocList}>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a className={styles.tocLink} href={`#${s.id}`}>
                <span className={styles.tocNum}>{localizeDigits(i + 1, locale)}.</span>
                <span>{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div>
        {updatedLabel ? <p className={styles.updated}>{updatedLabel}</p> : null}
        <div className={styles.sections}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionNum} aria-hidden="true">
                  {localizeDigits(i + 1, locale)}
                </span>
                <h2 className={styles.sectionTitle}>{s.title}</h2>
              </div>
              <div className={prose.prose}>{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
