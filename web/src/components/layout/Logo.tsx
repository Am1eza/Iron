import Link from 'next/link';
import { routes } from '@/lib/routes';
import styles from './Logo.module.css';
import { BrandMark } from './BrandMark';

/**
 * Ahantime lockup — the AT-circle mark (inline vector, see BrandMark) +
 * wordmark. The mark rides `currentColor`, colored via .mark in CSS: brand
 * teal on light, lifted teal in dark theme, white in the `light` hero
 * variant. `compact` drops the wordmark for the condensed header.
 */
export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link
      href={routes.home()}
      className={`${styles.logo} ${light ? styles.light : ''}`}
      aria-label="آهن‌تایم — خانه"
    >
      <BrandMark size={38} className={styles.mark} />
      {!compact && (
        <span className={styles.word}>
          <span className={styles.wordmark}>آهن‌تایم</span>
          <span className={styles.tagline}>بازار هوشمند فولاد</span>
        </span>
      )}
    </Link>
  );
}
