import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman, formatMovement, priceHiddenLabel, toPersianDigits } from '@/lib/utils/format';
import type { Category, PriceRow } from '@/lib/types/domain';
import { FactoryLink } from '@/components/catalog/FactoryLink';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CategoryPriceSummary.module.css';

/**
 * The /prices hub's actual content: one live headline price per product
 * category, in one compact table.
 *
 * The hub used to render six میلگرد rows and nothing else — a thin snippet on
 * the site's single highest-intent query («قیمت روز آهن»), where the visitor's
 * question is "what do all the main sections cost today", not "show me rebar".
 * Every row here is a real SKU with a real admin-entered price, linking both
 * to that SKU and to the category's full table, so the page answers the query
 * on its own and still routes deeper.
 *
 * A category whose headline price has gone stale-hidden still appears, showing
 * «تماس بگیرید» — omitting it would silently misrepresent the catalogue.
 */
export function CategoryPriceSummary({
  rows,
  categories,
}: {
  rows: PriceRow[];
  categories: Category[];
}) {
  if (rows.length === 0) return null;
  const catName = new Map(categories.map((c) => [c.slug, c.name]));
  const labelled = rows.map((r) => ({ row: r, category: catName.get(r.categoryId) ?? r.categoryId }));

  return (
    <section className={styles.section} aria-labelledby="summary-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>خلاصهٔ بازار امروز</p>
          <h2 id="summary-title" className={styles.title}>
            قیمت شاخص هر دسته
          </h2>
        </div>
      </header>

      <div className={styles.tableWrap} role="region" aria-label="قیمت شاخص هر دسته" tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className={styles.caption}>
            برای هر دستهٔ آهن‌آلات، تازه‌ترین قیمت ثبت‌شدهٔ یک محصول شاخص. جدول کامل هر دسته با
            همهٔ سایزها و کارخانه‌ها یک کلیک پایین‌تر است.
          </caption>
          <thead>
            <tr>
              <th scope="col">دسته</th>
              <th scope="col">محصول شاخص</th>
              <th scope="col">سایز</th>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.num}>
                قیمت (تومان)
              </th>
              <th scope="col" className={styles.num}>
                نوسان
              </th>
              <th scope="col">زمان تحویل</th>
              <th scope="col" className={styles.action}>
                <span className="visually-hidden">جدول کامل</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {labelled.map(({ row: r, category }) => {
              const up = r.current.movementDir === 'up';
              const down = r.current.movementDir === 'down';
              return (
                <tr key={r.id}>
                  <th scope="row" className={styles.name}>
                    <Link href={routes.category(r.categoryId)} className={styles.catLink}>
                      {category}
                    </Link>
                  </th>
                  <td>
                    <Link
                      href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                      className={styles.skuLink}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td>{r.size ? toPersianDigits(r.size) : 'نامشخص'}</td>
                  <td className={styles.muted}>
                    <FactoryLink categorySlug={r.categoryId} factory={r.factory} />
                  </td>
                  <td className={`${styles.num} ${styles.price}`}>
                    {priceHiddenLabel(r.current) ?? formatToman(r.current.price, false)}
                  </td>
                  <td
                    className={`${styles.num} ${up ? styles.up : down ? styles.down : styles.flat}`}
                  >
                    <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                    {formatMovement(r.current.movementPct)}
                  </td>
                  <td className={styles.muted}>{r.current.deliveryTime || '—'}</td>
                  <td className={styles.action}>
                    <Link
                      href={routes.category(r.categoryId)}
                      className={styles.detail}
                      aria-label={`جدول کامل ${category}`}
                    >
                      <ChevronStartIcon size={16} className="icon--rtl" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card fallback — the SAME rows, not a second data source; the
          table above is a 720px-wide horizontal scroller, which at the 320px
          WCAG 2.2 · 1.4.10 Reflow baseline would be 2.2× of sideways
          scrolling per price. Exactly one of the two is in the accessibility
          tree at any width (the other is `display:none`). */}
      <ul className={styles.cards}>
        {labelled.map(({ row: r, category }) => {
          const up = r.current.movementDir === 'up';
          const down = r.current.movementDir === 'down';
          return (
            <li key={r.id} className={styles.card}>
              <p className={styles.cardCat}>{category}</p>
              <Link
                href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                className={styles.cardLink}
              >
                <span className={styles.cardName}>{r.name}</span>
                <ChevronStartIcon size={16} className="icon--rtl" />
              </Link>
              <p className={`${styles.cardPrice} tnum`}>
                <span className={styles.price}>
                  {priceHiddenLabel(r.current) ?? formatToman(r.current.price, false)}
                </span>
                <span className={up ? styles.up : down ? styles.down : styles.flat}>
                  <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                  {formatMovement(r.current.movementPct)}
                </span>
              </p>
              <dl className={styles.cardMeta}>
                <div>
                  <dt>سایز</dt>
                  <dd className="tnum">{r.size ? toPersianDigits(r.size) : 'نامشخص'}</dd>
                </div>
                <div>
                  <dt>کارخانه</dt>
                  <dd>
                    <FactoryLink categorySlug={r.categoryId} factory={r.factory} />
                  </dd>
                </div>
                <div>
                  <dt>زمان تحویل</dt>
                  <dd>{r.current.deliveryTime || '—'}</dd>
                </div>
              </dl>
              <Link href={routes.category(r.categoryId)} className={styles.cardAll}>
                جدول کامل {category}
                <ChevronStartIcon size={16} className="icon--rtl" />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>
        قیمت‌ها بدون احتساب ارزش افزوده و بر پایهٔ نرخ‌های ثبت‌شدهٔ کارشناسان آهن‌تایم‌اند. برای
        تأیید نهایی و زمان تحویل دقیق، پیش‌فاکتور بگیرید؛ اول مشورت، بعد خرید.
      </p>
    </section>
  );
}
