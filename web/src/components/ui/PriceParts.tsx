import { formatToman, formatMovement, toPersianDigits } from '@/lib/utils/format';
import type { MovementDir } from '@/lib/types/domain';
import { ClockIcon, CheckIcon } from '@/components/primitives/icons';
import styles from './PriceParts.module.css';

/**
 * E5 · «بهترین قیمت» badge — a STATUS signal (which factory currently wins a
 * size comparison), not decoration. Per this codebase's own accessibility
 * pattern (see DeliveryBadge's `guaranteed` variant, MovementBadge's arrow):
 * icon + visible Persian label, on the same gain/success token those already
 * use — never a bare color/background as the only signal. Never render this
 * on a stale/hidden-price row; the caller is responsible for excluding those
 * before picking a "best".
 *
 * Currently unrendered: its only caller was PriceTable's «مقایسهٔ سریع بر
 * اساس سایز» panel, removed on the owner's instruction (1405/05). Kept as a
 * kit primitive (like `PriceTag`) rather than deleted — `BulkQuote`'s
 * «مقایسهٔ کارخانه‌ها» crowns its own winner with a `.bestRow` tint today and
 * is the obvious next caller.
 */
export function BestPriceBadge() {
  return (
    <span className={styles.bestPrice}>
      <span className={styles.bestPriceIcon} aria-hidden="true">
        <CheckIcon size={14} />
      </span>
      بهترین قیمت
    </span>
  );
}

/**
 * E3 · نوسان indicator — movement %, ALWAYS pairing color with an arrow + sign
 * (color-blind safe). `pill` tints it for emphasis.
 */
export function MovementBadge({
  dir,
  pct,
  pill = false,
  onPanel = false,
}: {
  dir: MovementDir;
  pct?: number;
  pill?: boolean;
  /** Set on the dark gunmetal "steel terminal" panels (PriceBoard's aside, etc.)
   *  — the plain gain/loss text colors are tuned for light surfaces and fall
   *  below WCAG AA against a permanently-dark background. */
  onPanel?: boolean;
}) {
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  const cls = dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.flat;
  const label = dir === 'up' ? 'افزایش' : dir === 'down' ? 'کاهش' : 'بدون تغییر';
  const text = formatMovement(pct);
  // No numeric pct (no history to compute a real % from, e.g. the market
  // board's admin-entered شمش فولاد placeholder) previously left this pill
  // visually empty — the label only existed in a visually-hidden span for
  // screen readers, so sighted users saw a blank pill that also collapsed in
  // height next to its siblings. Show the word itself instead of nothing.
  return (
    <span className={`${styles.move} ${cls} ${pill ? styles.movePill : ''} ${onPanel ? styles.onPanel : ''} tnum`}>
      <span aria-hidden="true">{arrow}</span>
      <span className={text ? 'visually-hidden' : undefined}>{label} </span>
      {text}
    </span>
  );
}

/**
 * E2 · Price cell / hero — the price number with a muted «تومان» unit.
 * `size="hero"` for SKU pages; `size="cell"` (default) for tables/cards.
 */
export function PriceTag({
  value,
  size = 'cell',
  unitLabel = 'تومان',
}: {
  value: number;
  size?: 'cell' | 'hero';
  unitLabel?: string;
}) {
  return (
    <span className={`${styles.price} ${size === 'hero' ? styles.hero : styles.cell} tnum`}>
      <span className={styles.priceNum}>{formatToman(value, false)}</span>
      <span className={styles.priceUnit}>{unitLabel}</span>
    </span>
  );
}

/**
 * E4 · زمان تحویل badge — the ownable delivery-time trust signal. Quiet hairline
 * badge with a clock glyph; `guaranteed` adds a subtle check + «تحویل تضمینی».
 */
export function DeliveryBadge({
  value,
  guaranteed = false,
}: {
  value: string;
  guaranteed?: boolean;
}) {
  return (
    <span className={`${styles.delivery} ${guaranteed ? styles.guaranteed : ''}`}>
      <span className={styles.deliveryIcon} aria-hidden="true">
        {guaranteed ? <CheckIcon size={14} /> : <ClockIcon size={14} />}
      </span>
      <span className="tnum">{toPersianDigits(value)}</span>
    </span>
  );
}
