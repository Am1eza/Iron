import { productImage, productThumb } from '@/lib/data/productImages';
import styles from './ProductImage.module.css';

/**
 * A category's real product photo, filling its (sized, overflow-hidden) parent
 * with object-fit: cover. Returns null when the category has no photo so callers
 * can fall back to the CategoryArt illustration. Plain <img> (no runtime
 * optimizer). Pass `variant="thumb"` in small contexts (menus, rails, compact
 * headers) to load the ~320px thumbnail instead of the full 1200px image.
 */
export function ProductImage({
  slug,
  name,
  eager,
  variant = 'full',
  className,
}: {
  slug: string;
  name: string;
  eager?: boolean;
  variant?: 'full' | 'thumb';
  className?: string;
}) {
  const src = variant === 'thumb' ? productThumb(slug) : productImage(slug);
  if (!src) return null;
  const [w, h] = variant === 'thumb' ? [320, 213] : [1200, 800];
  return (
    <img
      src={src}
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
