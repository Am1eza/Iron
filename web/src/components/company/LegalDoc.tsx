import type { ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import prose from './Prose.module.css';
import styles from './LegalDoc.module.css';

/**
 * LegalDoc — renders a numbered legal document (terms / privacy) as anchored
 * sections with a sticky table of contents. Server component. Each section's
 * `id` is a stable ASCII slug for deep-linking; titles/body are Persian.
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
  tocTitle = 'فهرست',
}: {
  sections: LegalSection[];
  /** e.g. «آخرین به‌روزرسانی: تیر ۱۴۰۵». */
  updatedLabel?: string;
  tocTitle?: string;
}) {
  return (
    <div className={styles.layout}>
      <nav className={styles.toc} aria-label="فهرست مطالب">
        <p className={styles.tocTitle}>{tocTitle}</p>
        <ol className={styles.tocList}>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a className={styles.tocLink} href={`#${s.id}`}>
                <span className={styles.tocNum}>{toPersianDigits(i + 1)}.</span>
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
                  {toPersianDigits(i + 1)}
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
