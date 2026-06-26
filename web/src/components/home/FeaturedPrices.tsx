import Link from 'next/link';
import { routes } from '@/lib/routes';
import { rebarRows } from '@/lib/mock/fixtures';
import { formatToman, formatMovement, toPersianDigits } from '@/lib/utils/format';
import type { PriceRow } from '@/lib/types/domain';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './FeaturedPrices.module.css';

/**
 * Home price preview — a compact «Datasheet» taste so Pros see live prices above the
 * fold. Persian numerals + tabular figures; نوسان is color + arrow coded (gain/loss).
 */
export function FeaturedPrices({ rows = rebarRows }: { rows?: PriceRow[] }) {
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
              <th scope="col" className={styles.action} />
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
                    {formatToman(r.current.price, false)}
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
                      href={routes.sku('rebar', 'deformed', r.slug)}
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
      <p className={styles.note}>قیمت‌ها بدون احتساب ارزش افزوده‌اند و لحظه‌ای به‌روزرسانی می‌شوند.</p>
    </section>
  );
}
