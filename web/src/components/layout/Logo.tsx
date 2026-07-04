import Image from 'next/image';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import styles from './Logo.module.css';
import logoMark from '../../../public/brand/ahantime-logo.png';

/**
 * Ahantime lockup — the official AT + I-beam mark (brand/ahantime_logo.png,
 * see brand-book.md §04) + wordmark. The mark is a fixed-color raster asset
 * (not currentColor), so it renders identically in light/dark contexts.
 * `compact` drops the wordmark for the condensed header.
 */
export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link
      href={routes.home()}
      className={`${styles.logo} ${light ? styles.light : ''}`}
      aria-label="آهن‌تایم — خانه"
    >
      <Image src={logoMark} alt="" className={styles.mark} priority unoptimized={false} />
      {!compact && (
        <span className={styles.word}>
          <span className={styles.wordmark}>آهن‌تایم</span>
          <span className={styles.tagline}>بازار هوشمند فولاد</span>
        </span>
      )}
    </Link>
  );
}
