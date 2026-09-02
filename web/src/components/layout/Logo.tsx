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
 * so any logo shape works without CSS edits.
 *
 * `compact` drops the wordmark, but ONLY below Header's own 1024px nav
 * breakpoint (see Logo.module.css) — Header passes it on scroll-condense,
 * and above 1024px condensing is a scroll-position affordance with plenty of
 * bar width to spare, not a real space constraint. Dropping the wordmark
 * there was losing brand identity on desktop for no space it needed back
 * (design/UX audit). Below 1024px the header is already in hamburger mode,
 * where every pixel is genuinely scarce, so the icon-only condense stays.
 */
const MARK_H = 38;
const MARK_W = Math.round((logoMark.width / logoMark.height) * MARK_H);

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link
      href={routes.home()}
      className={`${styles.logo} ${light ? styles.light : ''}`}
      aria-label="آهن‌تایم، خانه"
    >
      <Image
        src={logoMark}
        alt="آهن‌تایم"
        className={styles.mark}
        width={MARK_W}
        height={MARK_H}
        /* No `sizes` on purpose. Passing one (even the correct `38px`) makes
         * next/image treat this as a responsive image and emit the FULL
         * candidate list — 16 entries from 16w to 3840w — with `src` set to
         * the 3840w encode as the no-srcSet fallback. Real browsers all
         * support srcSet and picked a small candidate, so this was never
         * broken; it just meant the header logo advertised a 3840px encode
         * (19 KB, 324ms to generate) that nothing should ever fetch, and
         * kept 16 variants warm in the optimizer cache.
         *
         * Dropping `sizes` on a fixed width/height image makes next/image
         * emit exactly the 1x and 2x encodes and point `src` at the 2x —
         * which is all a 38px-tall logo can ever need. */
        priority
      />
      <span className={styles.word} data-compact={compact ? '' : undefined}>
        <span className={styles.wordmark}>آهن‌تایم</span>
        <span className={styles.tagline}>بازار هوشمند فولاد</span>
      </span>
    </Link>
  );
}
