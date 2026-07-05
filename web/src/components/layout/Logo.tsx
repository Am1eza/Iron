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
      {/* Rendered ~36px tall (~66px wide). `sizes` pins the preloaded srcset
          candidate to that size instead of Next's default 100vw, which was
          preloading a ~1920px variant of a 640×350 asset on the critical path. */}
      <Image src={logoMark} alt="" className={styles.mark} sizes="66px" priority unoptimized={false} />
      {!compact && (
        <span className={styles.word}>
          <span className={styles.wordmark}>آهن‌تایم</span>
          <span className={styles.tagline}>بازار هوشمند فولاد</span>
        </span>
      )}
    </Link>
  );
}
