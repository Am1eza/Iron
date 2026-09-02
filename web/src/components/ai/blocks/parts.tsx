import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { ClockIcon } from '@/components/primitives/icons';
import styles from './blocks.module.css';

/**
 * «آخرین به‌روزرسانی: ۱۴۰۵/۰۶/۰۷ ساعت ۱۴:۳۰».
 *
 * On EVERY card that carries a price, without exception. A number with no
 * timestamp is a claim; a number with one is a quote, and in a market that
 * reprices intraday that difference is the whole trust story — it is also the
 * first thing a buyer checks before repeating a figure to their own customer.
 * `<time>` carries the machine-readable ISO alongside the Jalali text.
 */
export function Freshness({ at, stale }: { at: string; stale?: boolean }) {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return null;
  return (
    <p className={`${styles.freshness}${stale ? ` ${styles.freshnessStale}` : ''}`}>
      <ClockIcon size={13} aria-hidden="true" />
      <span>
        آخرین به‌روزرسانی:{' '}
        <time dateTime={at} className="tnum">
          {formatJalali(at)} ساعت {formatJalali(at, 'HH:mm')}
        </time>
      </span>
      {stale ? <span className={styles.staleTag}>نیازمند تأیید کارشناس</span> : null}
    </p>
  );
}

/** A label/value pair inside a card's numeric block. */
export function Stat({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue}${strong ? ` ${styles.statValueStrong}` : ''} tnum`}>{value}</span>
    </div>
  );
}

/** The card's own title strip. `badge` is the card-kind tag («مقایسهٔ کارخانه‌ها»). */
export function CardHead({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className={styles.head}>
      <span className={styles.badge}>{badge}</span>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      {subtitle ? <p className={styles.subtitle}>{toPersianDigits(subtitle)}</p> : null}
    </div>
  );
}
