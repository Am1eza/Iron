'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMarket } from '@/lib/hooks/useMarket';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatMovement } from '@/lib/utils/format';
import type { MarketValue } from '@/lib/types/domain';
import { marketValues as fallbackValues } from '@/lib/mock/fixtures';
import styles from './Ticker.module.css';

/**
* N1 · نبض بازار — the slim moving ribbon at the very top of every page (home
 * included). Polls tgju-backed market values (useMarket, 60s). Desktop: an
 * auto-scroll marquee that pauses on hover/focus (that hover-pause is the
 * WCAG 2.2.2 mechanism — the old on-strip pause button is gone by owner
 * request; it rendered as a broken emoji square on iOS). Mobile and
 * `prefers-reduced-motion`: a static, manually-swipeable strip (no motion →
 * no pause control needed). Never blank: falls back to last-known values.
 */
export function Ticker() {
  const { data, isError } = useMarket();
  const reduced = useReducedMotion();
  // ≤767px → static swipeable strip (matches the CSS breakpoint that also
  // kills the animation pre-hydration).
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const staticStrip = reduced || mobile;
  const values = data?.values?.length ? data.values : fallbackValues;

  // Duplicate the set so the marquee loops seamlessly (the second copy is decorative).
  const items = staticStrip ? values : [...values, ...values];

  return (
    <aside className={styles.ticker} aria-label="نبض بازار">
      <span className={styles.tag} aria-hidden="true">
        نبض بازار
      </span>
      <div className={styles.viewport} data-reduced={staticStrip ? '' : undefined}>
        <ul className={`${styles.track} tnum`}>
          {items.map((v, i) => (
            <TickerItem key={`${v.key}-${i}`} v={v} decorative={!staticStrip && i >= values.length} />
          ))}
        </ul>
      </div>
      {isError && (
        <span className={styles.stale} title="آخرین مقادیر شناخته‌شده">
          با تأخیر
        </span>
      )}
    </aside>
  );
}

function TickerItem({ v, decorative }: { v: MarketValue; decorative: boolean }) {
  const dirClass =
    v.movementDir === 'up' ? styles.up : v.movementDir === 'down' ? styles.down : styles.flat;
  const arrow = v.movementDir === 'up' ? '▲' : v.movementDir === 'down' ? '▼' : '•';
  const valueText =
    v.unit === 'تومان' ? formatToman(v.value, false) : toPersianDigits(v.value.toLocaleString('en-US'));

  return (
    <li className={styles.item} aria-hidden={decorative ? 'true' : undefined}>
      <Link
        href={routes.market()}
        className={styles.link}
        tabIndex={decorative ? -1 : undefined}
        data-event="ticker_item_click"
      >
        <span className={styles.label}>{v.label}</span>
        <span className={styles.value}>{valueText}</span>
        <span className={styles.unit}>{v.unit}</span>
        <span className={`${styles.move} ${dirClass}`}>
          <span className={styles.arrow} aria-hidden="true">
            {arrow}
          </span>
          {formatMovement(v.movementPct)}
        </span>
        {v.isStale && <span className={styles.itemStale}>با تأخیر</span>}
      </Link>
    </li>
  );
}
