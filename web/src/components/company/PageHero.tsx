import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowEndIcon } from '@/components/primitives/icons';
import styles from './PageHero.module.css';

/**
 * PageHero — the quiet header for company pages (eyebrow · title · lead) plus an
 * optional row of link-styled CTAs. Server component. CTAs are real <Link>s
 * (navigation), styled to match the Button look without the client onClick path.
 */
export type HeroCta = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
  /** Show a trailing arrow (mirrored for RTL). */
  arrow?: boolean;
};

export function PageHero({
  eyebrow,
  title,
  lead,
  id,
  ctas,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  /** id for the <h1>, so the page <Section> can be aria-labelledby it. */
  id?: string;
  ctas?: HeroCta[];
}) {
  return (
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 id={id} className={styles.title}>
        {title}
      </h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {ctas && ctas.length > 0 ? (
        <div className={styles.ctaRow}>
          {ctas.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={[
                styles.cta,
                c.variant === 'secondary' ? styles.ctaSecondary : styles.ctaPrimary,
              ].join(' ')}
            >
              {c.label}
              {c.arrow ? <ArrowEndIcon size={18} className="icon--rtl" /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
