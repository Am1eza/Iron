import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowEndIcon } from '@/components/primitives/icons';
import styles from './TrackCard.module.css';

/**
 * TrackCard — a calm, linked card for one همکاری track. White paper, hairline,
 * soft hover lift. The whole card is a single <Link>; the trailing arrow mirrors
 * for RTL. Server component (pure markup, no client state).
 */
export function TrackCard({
  href,
  icon,
  title,
  desc,
  audience,
  cta,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  desc: string;
  /** Short "who is this for" line, shown as a quiet footnote. */
  audience: string;
  cta: string;
}) {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.desc}>{desc}</span>
        <span className={styles.audience}>{audience}</span>
      </span>
      <span className={styles.cta}>
        {cta}
        <ArrowEndIcon size={18} className={`icon--rtl ${styles.arrow}`} />
      </span>
    </Link>
  );
}
