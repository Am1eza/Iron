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
  level = 1,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  /** id for the heading, so the page <Section> can be aria-labelledby it. */
  id?: string;
  ctas?: HeroCta[];
  /** Heading level for `title` — default 1. Use 2 for a secondary/closing
   *  PageHero on a page that already has its own <h1> (only one h1 per page). */
  level?: 1 | 2;
}) {
  const Title = level === 2 ? 'h2' : 'h1';
  return (
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <Title id={id} className={styles.title}>
        {title}
      </Title>
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
