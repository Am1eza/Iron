import Link from 'next/link';
import { routes } from '@/lib/routes';
import styles from './Logo.module.css';

/**
 * Poladin lockup — the «steel tile» symbol (I-beam mark + amber Spark) + wordmark.
 * Inline SVG so it inherits currentColor and scales crisply; the Spark is the one
 * licensed flourish (brand-book). `compact` drops the wordmark for the condensed header.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href={routes.home()} className={styles.logo} aria-label="پولادین — خانه">
      <svg
        className={styles.mark}
        viewBox="0 0 120 120"
        width="36"
        height="36"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="120" height="120" rx="27" className={styles.tile} />
        <g className={styles.beam}>
          <rect x="36" y="40" width="48" height="11" rx="3" />
          <rect x="54.5" y="48" width="11" height="24" rx="2" />
          <rect x="36" y="69" width="48" height="11" rx="3" />
        </g>
        <path
          d="M89,26 C89.5,33 91.5,35 98.5,35.5 C91.5,36 89.5,38 89,45 C88.5,38 86.5,36 79.5,35.5 C86.5,35 88.5,33 89,26 Z"
          className={styles.spark}
        />
      </svg>
      {!compact && (
        <span className={styles.word}>
          <span className={styles.wordmark}>پولادین</span>
          <span className={styles.tagline}>بازار هوشمند فولاد</span>
        </span>
      )}
    </Link>
  );
}
