import { Heading, Text } from '@/components/ui';
import { ProductImage } from './ProductImage';
import { CategoryArt } from './CategoryArt';
import { productImage } from '@/lib/data/productImages';
import styles from './PriceHeader.module.css';

/**
 * Price-page header — the «قیمت روز …» title + description with a small, minimal
 * product thumbnail beside it. Shared by the category and sub-category pages so
 * every product table leads with the same compact, on-brand image.
 */
export function PriceHeader({
  categorySlug,
  categoryName,
  id,
  title,
  description,
}: {
  categorySlug: string;
  categoryName: string;
  id?: string;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.header}>
      <figure className={styles.thumb}>
        {productImage(categorySlug) ? (
          <ProductImage slug={categorySlug} name={categoryName} variant="thumb" eager />
        ) : (
          <span className={styles.art} aria-hidden="true">
            <CategoryArt slug={categorySlug} size={40} />
          </span>
        )}
      </figure>
      <div className={styles.text}>
        <Heading level={1} id={id}>
          {title}
        </Heading>
        <Text color="muted">{description}</Text>
      </div>
    </div>
  );
}
