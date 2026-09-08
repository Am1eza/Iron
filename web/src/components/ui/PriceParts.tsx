import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/config';
import { formatToman, formatMovement, localizeDigits } from '@/lib/utils/format';
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
  const t = useTranslations('priceParts');
  return (
    <span className={styles.bestPrice}>
      <span className={styles.bestPriceIcon} aria-hidden="true">
        <CheckIcon size={14} />
      </span>
      {t('bestPrice')}
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
  const locale = useLocale() as AppLocale;
  const t = useTranslations('priceParts');
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  const cls = dir === 'up' ? styles.up : dir === 'down' ? styles.down : styles.flat;
  const label = dir === 'up' ? t('increased') : dir === 'down' ? t('decreased') : t('unchanged');
  const text = formatMovement(pct, locale);
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
  unitLabel,
}: {
  value: number;
  size?: 'cell' | 'hero';
  unitLabel?: string;
}) {
  const locale = useLocale() as AppLocale;
  const tCommon = useTranslations('common');
  return (
    <span className={`${styles.price} ${size === 'hero' ? styles.hero : styles.cell} tnum`}>
      <span className={styles.priceNum}>{localizeDigits(formatToman(value, false), locale)}</span>
      <span className={styles.priceUnit}>{unitLabel ?? tCommon('unit.currency')}</span>
    </span>
  );
}

/**
 * E4 · زمان تحویل اعلام‌شده — an estimate until sales confirms it in writing.
 */
export function DeliveryBadge({
  value,
  guaranteed = false,
}: {
  value: string;
  guaranteed?: boolean;
}) {
  const locale = useLocale() as AppLocale;
  // `value` is admin-entered free text («۲۴ ساعت», «فوری», …) — DB content,
  // like a product name, not this app's UI vocabulary (see catalogLabels.ts's
  // `translateLabel` header comment for the same distinction). Only the
  // digits inside it are locale-aware here; the Persian words themselves are
  // out of scope for this pass — see the delivery-time note in the i18n audit.
  return (
    <span className={`${styles.delivery} ${guaranteed ? styles.guaranteed : ''}`}>
      <span className={styles.deliveryIcon} aria-hidden="true">
        {guaranteed ? <CheckIcon size={14} /> : <ClockIcon size={14} />}
      </span>
      <span className="tnum">{localizeDigits(value, locale)}</span>
    </span>
  );
}
