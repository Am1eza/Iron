import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman, formatMovement, priceHiddenLabel, toPersianDigits } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './FeaturedPrices.module.css';

/**
 * /prices hub price preview — a compact «Datasheet» taste so Pros see live prices
 * above the fold. Persian numerals + tabular figures; نوسان is color + arrow coded
 * (gain/loss). `rows` is required (server-fetched, live-aware) — a mock default
 * here previously meant the sole caller (which passed no prop) always rendered
 * fake rebar rows, even in production.
 */
export function FeaturedPrices({ rows }: { rows: PriceRow[] }) {
  return (
    <section className={styles.section} aria-labelledby="featured-title">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>پرطرفدارترین‌ها</p>
          <h2 id="featured-title" className={styles.title}>
            قیمت میلگرد امروز
          </h2>
        </div>
        <Link href={routes.category('rebar')} className={styles.all}>
          جدول کامل میلگرد
          <ChevronStartIcon size={16} className="icon--rtl" />
        </Link>
      </header>

      <div className={styles.tableWrap} role="region" aria-label="قیمت میلگرد" tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">قیمت میلگرد</caption>
          <thead>
            <tr>
              <th scope="col">محصول</th>
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
                <span className="visually-hidden">جزئیات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const up = r.current.movementDir === 'up';
              const down = r.current.movementDir === 'down';
              return (
                <tr key={r.id}>
                  <th scope="row" className={styles.name}>
                    {r.name}
                  </th>
                  <td>{r.size ? toPersianDigits(r.size) : '—'}</td>
                  <td className={styles.muted}>{r.factory ?? '—'}</td>
                  <td className={`${styles.num} ${styles.price}`}>
                    {priceHiddenLabel(r.current) ?? formatToman(r.current.price, false)}
                  </td>
                  <td
                    className={`${styles.num} ${up ? styles.up : down ? styles.down : styles.flat}`}
                  >
                    <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                    {formatMovement(r.current.movementPct)}
                  </td>
                  <td className={styles.muted}>{r.current.deliveryTime}</td>
                  <td className={styles.action}>
                    <Link
                      href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
                      className={styles.detail}
                      aria-label={`جزئیات ${r.name}`}
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

      {/* Mobile card fallback — the SAME rows, not a second data source. The
          table above is `min-inline-size: 640px` inside a horizontal scroller,
          which at the 320px baseline WCAG 2.2 · 1.4.10 Reflow is measured
          against means 2.2× of sideways scrolling to read a single price. The
          table→card conversion at 767px is the pattern PriceTable already
          uses; this brings the /prices hub preview in line with it. Exactly
          one of the two is in the accessibility tree at any width (the hidden
          one is `display:none`, not visually-hidden), so nothing is
          duplicated for a screen reader. */}
      <ul className={styles.cards}>
        {rows.map((r) => {
          const up = r.current.movementDir === 'up';
          const down = r.current.movementDir === 'down';
          return (
            <li key={r.id} className={styles.card}>
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
                <span className={`${up ? styles.up : down ? styles.down : styles.flat}`}>
                  <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                  {formatMovement(r.current.movementPct)}
                </span>
              </p>
              <dl className={styles.cardMeta}>
                <div>
                  <dt>سایز</dt>
                  <dd className="tnum">{r.size ? toPersianDigits(r.size) : '—'}</dd>
                </div>
                <div>
                  <dt>کارخانه</dt>
                  <dd>{r.factory ?? '—'}</dd>
                </div>
                <div>
                  <dt>زمان تحویل</dt>
                  <dd>{r.current.deliveryTime}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>قیمت‌ها بدون احتساب ارزش افزوده‌اند و لحظه‌ای به‌روزرسانی می‌شوند.</p>
    </section>
  );
}
