import { productImage, productThumb } from '@/lib/data/productImages';
import styles from './ProductImage.module.css';

/**
 * A category's real product photo, filling its (sized, overflow-hidden) parent
 * with object-fit: cover. Returns null when the category has no photo so callers
 * can fall back to the CategoryArt illustration. Plain <img> (no runtime
 * optimizer). Pass `variant="thumb"` in small contexts (menus, rails, compact
 * headers) to load the ~320px thumbnail instead of the full 1200px image.
 *
 * The full variant offers BOTH files as a srcset with a `sizes` hint, so a box
 * only a few hundred CSS pixels wide downloads the 320px thumbnail instead of
 * the 1200px original. Without it the homepage's hover-reveal panel pulled the
 * full-size file into a ~520px box — ~45 KB wasted on the first screen of
 * every visit, which costs most on the mobile connections this site is
 * actually browsed on.
 */
export function ProductImage({
  slug,
  name,
  eager,
  variant = 'full',
  className,
  /** The CSS width this image renders at, for the browser's srcset choice.
   *  Defaults to full-bleed; pass the real box width where it is smaller. */
  sizes = '100vw',
}: {
  slug: string;
  name: string;
  eager?: boolean;
  variant?: 'full' | 'thumb';
  className?: string;
  sizes?: string;
}) {
  const src = variant === 'thumb' ? productThumb(slug) : productImage(slug);
  if (!src) return null;
  const [w, h] = variant === 'thumb' ? [320, 213] : [1200, 800];
  // Only the full variant has a choice to offer — the thumb IS the small one.
  const thumb = variant === 'full' ? productThumb(slug) : undefined;
  return (
    <img
      src={src}
      srcSet={thumb ? `${thumb} 320w, ${src} 1200w` : undefined}
      sizes={thumb ? sizes : undefined}
      alt={`تصویر ${name}`}
      width={w}
      height={h}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={[styles.img, className].filter(Boolean).join(' ')}
    />
  );
}
