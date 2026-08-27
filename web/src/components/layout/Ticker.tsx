'use client';
import { useMarket } from '@/lib/hooks/useMarket';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits, formatMovement } from '@/lib/utils/format';
import type { MarketValue } from '@/lib/types/domain';
import styles from './Ticker.module.css';
import Link from 'next/link';

/**
 * N1 · نبض بازار — the slim moving ribbon at the very top of every page (home
 * included). Polls tgju-backed market values (useMarket, 60s). Auto-scroll
 * marquee on both desktop and mobile.
 *
 * No manual pause control: the owner explicitly asked for it removed
 * (2026-08-14) after already accepting the same trade-off on HeroVideo.
 * `prefers-reduced-motion` is the only remaining WCAG 2.2.2 mechanism — when
 * set, the strip is static and manually swipeable instead of auto-scrolling,
 * same as before. A touch user who hasn't set that OS-level preference has
 * no way to stop the scroll; this is a known, accepted gap, not an oversight.
 *
 * Never blank: falls back to the skeleton below until the first poll lands.
 */

/**
 * Placeholder rows shown for the ~1 poll it takes real values to arrive. This
 * used to import the shared mock fixtures module, which dragged 18.7 kB of
 * sample SKUs, price rows and articles into the bundle of EVERY page for the
 * sake of five labels. Values are deliberately null/zero — a plausible-looking
 * fake price at the top of the page would be worse than an obvious placeholder.
 */
const PLACEHOLDER: MarketValue[] = [
  {
    key: 'usd',
    label: 'دلار',
    value: 0,
    unit: 'تومان',
    source: 'tgju',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: true,
  },
  {
    key: 'eur',
    label: 'یورو',
    value: 0,
    unit: 'تومان',
    source: 'tgju',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: true,
  },
  {
    key: 'gold18',
    label: 'طلای ۱۸',
    value: 0,
    unit: 'تومان',
    source: 'tgju',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: true,
  },
  {
    key: 'ounce',
    label: 'انس جهانی',
    value: 0,
    unit: 'دلار',
    source: 'tgju',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: true,
  },
  {
    key: 'billet',
    label: 'شمش فولاد',
    value: 0,
    unit: 'تومان',
    source: 'admin',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: true,
  },
];
export function Ticker({ initialValues }: { initialValues?: MarketValue[] }) {
  const { data } = useMarket();
  const reduced = useReducedMotion();
  // Real server-fetched values (see layout.tsx) beat the all-zero PLACEHOLDER
  // for the render(s) before the client's own poll lands — this is what
  // actually reaches a non-JS crawler and what a real visitor's first paint
  // shows, instead of a guaranteed-wrong "0 / 0.00%".
  const values = data?.values?.length
    ? data.values
    : initialValues?.length
      ? initialValues
      : PLACEHOLDER;

  // Duplicate the set so the marquee loops seamlessly (the second copy is decorative).
  const items = reduced ? values : [...values, ...values];

  return (
    <aside className={styles.ticker} aria-label="نبض بازار">
      <span className={styles.tag} aria-hidden="true">
        نبض بازار
      </span>
      <div className={styles.viewport} data-reduced={reduced ? '' : undefined}>
        <ul className={`${styles.track} tnum`}>
          {items.map((v, i) => (
            <TickerItem key={`${v.key}-${i}`} v={v} decorative={!reduced && i >= values.length} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function TickerItem({ v, decorative }: { v: MarketValue; decorative: boolean }) {
  const dirClass =
    v.movementDir === 'up' ? styles.up : v.movementDir === 'down' ? styles.down : styles.flat;
  const arrow = v.movementDir === 'up' ? '▲' : v.movementDir === 'down' ? '▼' : '•';
  const valueText =
    v.unit === 'تومان'
      ? formatToman(v.value, false)
      : toPersianDigits(v.value.toLocaleString('en-US'));

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
      </Link>
    </li>
  );
}
