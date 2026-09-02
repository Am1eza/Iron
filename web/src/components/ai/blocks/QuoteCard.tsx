import Link from 'next/link';
import type { QuoteBlock } from '@/lib/ai/blocks';
import { toPersianDigits } from '@/lib/utils/format';
import { MovementBadge, PriceTag, DeliveryBadge } from '@/components/ui/PriceParts';
import { Sparkline } from './Sparkline';
import { CardHead, Freshness } from './parts';
import styles from './blocks.module.css';

/**
 * One product, one price, and everything a buyer checks before repeating that
 * price to someone else: which mill, which size, what it moved since
 * yesterday, when it was last touched, and where it has been for a month.
 *
 * A withheld price (`price: null`) is the case this card exists to get right.
 * The old prose answer for a stale-hidden row was a sentence saying a کارشناس
 * would call; here the row still renders — name, mill, size, history — with
 * «استعلام از کارشناس» in the price slot and the contact action promoted.
 * Nothing is fabricated to fill the gap, and the visitor still learns what
 * the product is.
 */
export function QuoteCard({ block, onPick }: { block: QuoteBlock; onPick: (text: string) => void }) {
  const meta = [block.factory, block.size ? `سایز ${block.size}` : '', block.grade].filter(Boolean);

  return (
    <div className={styles.card}>
      <CardHead badge="قیمت روز" title={block.name} />
      {meta.length > 0 ? (
        <p className={styles.meta}>
          {meta.map((m, i) => (
            <span key={m}>
              {i > 0 ? <span className={styles.metaSep}> · </span> : null}
              {toPersianDigits(m!)}
            </span>
          ))}
        </p>
      ) : null}

      <div className={styles.priceRow}>
        {block.price === null ? (
          <span className={styles.priceAsk}>استعلام از کارشناس</span>
        ) : (
          <PriceTag value={block.price} unitLabel={block.unitLabel} />
        )}
        {block.movementDir ? <MovementBadge dir={block.movementDir} pct={block.movementPct} pill /> : null}
      </div>

      {block.deliveryTime ? (
        <div className={styles.badgeRow}>
          <DeliveryBadge value={block.deliveryTime} />
        </div>
      ) : null}

      {block.trend ? (
        <Sparkline
          values={block.trend.values}
          dates={block.trend.dates}
          unitLabel={block.unitLabel}
          label={`روند قیمت ${block.name}:`}
        />
      ) : null}

      <Freshness at={block.updatedAt} stale={block.isStale} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() => onPick(`قیمت ${block.name} را در همهٔ کارخانه‌ها مقایسه کن`)}
        >
          مقایسهٔ کارخانه‌ها
        </button>
        <button
          type="button"
          className={styles.actionGhost}
          onClick={() => onPick(`برای ${block.name} پیش‌فاکتور می‌خواهم`)}
        >
          پیش‌فاکتور
        </button>
        {block.href ? (
          <Link href={block.href} className={styles.actionLink}>
            صفحهٔ محصول
          </Link>
        ) : null}
      </div>
    </div>
  );
}
