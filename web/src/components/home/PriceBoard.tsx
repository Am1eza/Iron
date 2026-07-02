import Link from 'next/link';
import { routes } from '@/lib/routes';
import type { PriceRow } from '@/lib/types/domain';
import { MovementBadge } from '@/components/ui';
import { CountUp } from '@/components/ui/CountUp';
import { formatJalali } from '@/lib/utils/format';
import styles from './PriceBoard.module.css';

/**
 * The hero «تابلوی قیمت» — a gunmetal, blueprint-gridded live price board with
 * oversized Estedad tabular numerals. Real rows from the catalog (server-fed),
 * real movement badges, count-up on view. This is the brand's signature panel:
 * price data as the hero, not a stock photo.
 */
export function PriceBoard({ rows }: { rows: PriceRow[] }) {
  const updated = rows[0]?.current.updatedAt;
  return (
    <aside className={`${styles.board} blueprint`} aria-label="تابلوی قیمت لحظه‌ای">
      <header className={styles.head}>
        <span className={styles.live}>
          <span className={styles.dot} aria-hidden="true" />
          قیمت لحظه‌ای
        </span>
        {updated && <span className={styles.date}>{formatJalali(updated)}</span>}
      </header>

      <ul className={styles.rows}>
        {rows.map((r) => (
          <li key={r.id} className={styles.row}>
            <Link
              href={routes.sku(r.categoryId, r.subCategoryId, r.slug)}
              className={styles.rowLink}
            >
              <span className={styles.name}>{r.name}</span>
              <span className={styles.figures}>
                <span className={`${styles.price} tnum`}>
                  <CountUp value={r.current.price} />
                </span>
                <span className={styles.unit}>تومان</span>
                <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} onPanel />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <footer className={styles.foot}>
        <Link href={routes.prices()} className={styles.all}>
          مشاهده همهٔ قیمت‌ها
        </Link>
      </footer>
    </aside>
  );
}
