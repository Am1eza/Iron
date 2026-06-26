import { formatToman, formatMovement, toPersianDigits } from '@/lib/utils/format';
import type { MovementDir } from '@/lib/types/domain';
import { ClockIcon, CheckIcon } from '@/components/primitives/icons';
import styles from './PriceParts.module.css';

/**
 * E3 · نوسان indicator — movement %, ALWAYS pairing color with an arrow + sign
 * (color-blind safe). `pill` tints it for emphasis.
 */
export function MovementBadge({
  dir,
  pct,
  pill = false,
}: {
  dir: MovementDir;
  pct?: number;
  pill?: boolean;
}) {
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
  const cls = dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.flat;
  const label = dir === 'up' ? 'افزایش' : dir === 'down' ? 'کاهش' : 'بدون تغییر';
  return (
    <span className={`${styles.move} ${cls} ${pill ? styles.movePill : ''} tnum`}>
      <span aria-hidden="true">{arrow}</span>
      <span className="visually-hidden">{label} </span>
      {formatMovement(pct)}
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
