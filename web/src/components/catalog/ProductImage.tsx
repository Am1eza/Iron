import { productImage } from '@/lib/data/productImages';
import styles from './ProductImage.module.css';

/**
 * A category's real product photo, filling its (sized, overflow-hidden) parent
 * with object-fit: cover. Returns null when the category has no photo so callers
 * can fall back to the CategoryArt illustration. Plain <img> — the WebP sources
 * are already web-sized, so no runtime optimizer is needed.
 */
export function ProductImage({
  slug,
  name,
  eager,
  className,
}: {
  slug: string;
  name: string;
  eager?: boolean;
  className?: string;
}) {
  const src = productImage(slug);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={`تصویر ${name}`}
      width={1200}
      height={800}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={[styles.img, className].filter(Boolean).join(' ')}
    />
  );
}
