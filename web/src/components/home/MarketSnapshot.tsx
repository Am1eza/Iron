'use client';
import Link from 'next/link';
import { useMarket } from '@/lib/hooks/useMarket';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatMovement } from '@/lib/utils/format';
import { marketValues as fallback } from '@/lib/mock/fixtures';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './MarketSnapshot.module.css';

/**
 * نبض بازار — a calm card row of the headline market values (دلار/یورو/طلا/انس/شمش).
 * The hook for visitors who came «just to check the dollar»: clear, live, and a
 * doorway to the steel prices. Billet is admin-entered; the rest are tgju-backed.
 */
export function MarketSnapshot() {
  const { data } = useMarket();
  const values = data?.values?.length ? data.values : fallback;

  return (
    <section className={styles.section} aria-labelledby="market-title">
      <div className="container">
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>نبض بازار</p>
            <h2 id="market-title" className={styles.title}>
              دلار، طلا و شمش فولاد — لحظه‌ای
            </h2>
          </div>
          <Link href={routes.market()} className={styles.all}>
            طلا و ارز
            <ChevronStartIcon size={16} className="icon--rtl" />
          </Link>
        </div>

        <ul className={styles.grid}>
          {values.map((v) => {
            const up = v.movementDir === 'up';
            const down = v.movementDir === 'down';
            const val =
              v.unit === 'تومان'
                ? formatToman(v.value, false)
                : toPersianDigits(v.value.toLocaleString('en-US'));
            return (
              <li key={v.key} className={styles.card}>
                <span className={styles.label}>{v.label}</span>
                <span className={`${styles.value} tnum`}>
                  {val}
                  <span className={styles.unit}>{v.unit}</span>
                </span>
                <span className={`${styles.move} ${up ? styles.up : down ? styles.down : styles.flat} tnum`}>
                  <span aria-hidden>{up ? '▲' : down ? '▼' : '—'}</span>
                  {formatMovement(v.movementPct)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
