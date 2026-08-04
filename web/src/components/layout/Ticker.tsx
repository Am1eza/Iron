'use client';
import { useState } from 'react';
import { useMarket } from '@/lib/hooks/useMarket';
import { PauseIcon, PlayIcon } from '@/components/primitives/icons';
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
 * WCAG 2.2.2 Pause, Stop, Hide: the strip moves for longer than five seconds
 * and it is not the only content on the page, so it needs a pause MECHANISM.
 * `:hover`/`:focus-within` alone is not one — a touch user has no hover and
 * nothing here is focusable except the links, so on a phone the prices moved
 * forever with no way to stop them. There is now a real toggle button. It is
 * an inline SVG (`PauseIcon`/`PlayIcon`), never the ⏸ emoji — the emoji is
 * what rendered as a tofu box on iOS and got the first attempt rejected.
 * Hover/focus pausing is kept on top of it, unchanged.
 *
 * Under `prefers-reduced-motion` nothing animates in the first place (the
 * strip is static and manually swipeable), so the button is not rendered —
 * a control that pauses nothing is noise in the tab order.
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
  { key: 'usd', label: 'دلار', value: 0, unit: 'تومان', source: 'tgju', movementDir: 'flat', movementPct: 0, updatedAt: '', isStale: true },
  { key: 'eur', label: 'یورو', value: 0, unit: 'تومان', source: 'tgju', movementDir: 'flat', movementPct: 0, updatedAt: '', isStale: true },
  { key: 'gold18', label: 'طلای ۱۸', value: 0, unit: 'تومان', source: 'tgju', movementDir: 'flat', movementPct: 0, updatedAt: '', isStale: true },
  { key: 'ounce', label: 'انس جهانی', value: 0, unit: 'دلار', source: 'tgju', movementDir: 'flat', movementPct: 0, updatedAt: '', isStale: true },
  { key: 'billet', label: 'شمش فولاد', value: 0, unit: 'تومان', source: 'admin', movementDir: 'flat', movementPct: 0, updatedAt: '', isStale: true },
];
export function Ticker() {
  const { data, isError } = useMarket();
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const values = data?.values?.length ? data.values : PLACEHOLDER;

  // Duplicate the set so the marquee loops seamlessly (the second copy is decorative).
  const items = reduced ? values : [...values, ...values];

  return (
    <aside className={styles.ticker} aria-label="نبض بازار">
      <span className={styles.tag} aria-hidden="true">
        نبض بازار
      </span>
      <div
        className={styles.viewport}
        data-reduced={reduced ? '' : undefined}
        data-paused={!reduced && paused ? '' : undefined}
      >
        <ul className={`${styles.track} tnum`}>
          {items.map((v, i) => (
            <TickerItem key={`${v.key}-${i}`} v={v} decorative={!reduced && i >= values.length} />
          ))}
        </ul>
      </div>
      {isError && (
        <span className={styles.stale} title="آخرین مقادیر شناخته‌شده">
          با تأخیر
        </span>
      )}
      {!reduced && (
        <button
          type="button"
          className={styles.pause}
          onClick={() => setPaused((p) => !p)}
          // The label states the ACTION, and it is the accessible name of the
          // button itself — not a title tooltip, which touch users never see.
          // No aria-pressed alongside it: with a label that already flips
          // between «توقف» and «ادامه», a pressed state makes screen readers
          // announce the same fact twice and contradict themselves.
          aria-label={paused ? 'ادامهٔ حرکت نوار قیمت' : 'توقف حرکت نوار قیمت'}
          data-paused={paused ? '' : undefined}
        >
          {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
        </button>
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
