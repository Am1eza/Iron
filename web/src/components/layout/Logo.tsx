import Image from 'next/image';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import styles from './Logo.module.css';
import logoMark from '../../../public/brand/ahantime-logo.png';

/**
 * Ahantime lockup — the official mark + wordmark. The mark is the OWNER-OWNED
 * raster at public/brand/ahantime-logo.png: replacing that one file rebrands
 * the site header, admin topbar and proforma letterhead together. Width is
 * derived from the asset's real aspect ratio at build time (static import),
 * so any logo shape works without CSS edits. `compact` drops the wordmark.
 */
const MARK_H = 38;
const MARK_W = Math.round((logoMark.width / logoMark.height) * MARK_H);

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link
      href={routes.home()}
      className={`${styles.logo} ${light ? styles.light : ''}`}
      aria-label="آهن‌تایم — خانه"
    >
      <Image
        src={logoMark}
        alt=""
        className={styles.mark}
        width={MARK_W}
        height={MARK_H}
        sizes={`${MARK_W}px`}
        priority
      />
      {!compact && (
        <span className={styles.word}>
          <span className={styles.wordmark}>آهن‌تایم</span>
          <span className={styles.tagline}>بازار هوشمند فولاد</span>
        </span>
      )}
    </Link>
  );
}
