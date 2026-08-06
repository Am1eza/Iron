'use client';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import type { SubsMap } from '@/lib/data/catalog';
import type { Category } from '@/lib/types/domain';
import { ProductImage } from '@/components/catalog/ProductImage';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { productImage } from '@/lib/data/productImages';
import { groupByLabel } from '@/lib/utils/catalogGroups';
import { NavDropdown } from './NavDropdown';
import styles from './Header.module.css';

/**
 * «محصولات» desktop mega-menu — every category as a column with a small thumb,
 * its sub-groups listed beneath. Reuses the NavDropdown shell. Each category and
 * sub-group is a direct link to its price table.
 */
export function ProductsMenu({ categories, subs }: { categories: Category[]; subs: SubsMap }) {
  return (
    <NavDropdown label="محصولات" mega>
      <div className={styles.megaGrid}>
        {categories.map((cat) => (
          <div key={cat.id} className={styles.megaCol}>
            <Link href={routes.category(cat.slug)} className={styles.megaHead}>
              <span className={styles.megaThumb} aria-hidden>
                {productImage(cat.slug) ? (
                  <ProductImage slug={cat.slug} name={cat.name} variant="thumb" />
                ) : (
                  <CategoryArt slug={cat.slug} size={24} />
                )}
              </span>
              {cat.name}
            </Link>
            <ul className={styles.megaSubs}>
              {groupByLabel(subs[cat.slug] ?? []).map((group) => (
                <li key={group.label ?? `_solo_${group.items[0]!.slug}`}>
                  {group.label ? <div className={styles.megaSubGroupHeading}>{group.label}</div> : null}
                  <ul className={group.label ? `${styles.megaSubs} ${styles.megaSubGrouped}` : styles.megaSubs}>
                    {group.items.map((s) => (
                      <li key={s.slug}>
                        <Link href={routes.subCategory(cat.slug, s.slug)} className={styles.megaSub}>
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </NavDropdown>
  );
}
