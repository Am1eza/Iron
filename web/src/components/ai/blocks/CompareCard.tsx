import Link from 'next/link';
import type { CompareBlock } from '@/lib/ai/blocks';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { MovementBadge } from '@/components/ui/PriceParts';
import { CheckCircleIcon, TruckIcon } from '@/components/primitives/icons';
import { CardHead, Freshness, Stat } from './parts';
import styles from './blocks.module.css';

/**
 * Every mill quoting this product, side by side — the answer «قیمت میلگرد
 * چنده؟» actually deserves.
 *
 * A LIST OF CARDS, NOT A TABLE, at every width. A five-column table inside a
 * chat bubble at 375px is either horizontally scrollable (so the price column
 * is off-screen exactly when the visitor needs it) or squeezed until the mill
 * names wrap to three lines each. One card per mill reads the same on a phone
 * and on a desktop, and lets each row carry its own badges, movement and
 * timestamp without a header row having to explain what each column is. On a
 * wide screen the numeric pairs simply lay out in columns.
 *
 * TWO winners, not one. `cheapest` is lowest per-kilogram; `cheapestLanded` is
 * lowest once freight, handling, insurance and VAT to the visitor's own city
 * are added — and they are frequently different mills. Showing only the first
 * would be the ex-works answer a price list already gives; showing both is the
 * thing a person calls a broker for.
 */
export function CompareCard({ block, onPick }: { block: CompareBlock; onPick: (text: string) => void }) {
  const showLanded = block.rows.some((r) => typeof r.landedToman === 'number');

  return (
    <div className={`${styles.card} ${styles.cardWide}`}>
      <CardHead badge="مقایسهٔ کارخانه‌ها" title={block.title} subtitle={block.subtitle} />

      <ul className={styles.compareList}>
        {block.rows.map((row) => (
          <li
            key={row.factory}
            className={`${styles.compareItem}${row.cheapest ? ` ${styles.compareBest}` : ''}`}
          >
            <div className={styles.compareHead}>
              <span className={styles.compareFactory}>
                {row.href ? (
                  <Link href={row.href} className={styles.compareFactoryLink}>
                    {toPersianDigits(row.factory)}
                  </Link>
                ) : (
                  toPersianDigits(row.factory)
                )}
              </span>
              <span className={styles.compareTags}>
                {row.cheapest ? (
                  <span className={styles.tagBest}>
                    <CheckCircleIcon size={13} aria-hidden="true" />
                    ارزان‌ترین
                  </span>
                ) : null}
                {row.cheapestLanded ? (
                  <span className={styles.tagLanded}>
                    <TruckIcon size={13} aria-hidden="true" />
                    ارزان‌ترین با حمل
                  </span>
                ) : null}
              </span>
            </div>

            <div className={styles.compareNums}>
              <Stat
                label="هر کیلوگرم"
                value={`${formatToman(row.pricePerKg, false)} تومان`}
                strong
              />
              {typeof row.totalToman === 'number' ? (
                <Stat label="جمع کالا" value={formatToman(row.totalToman)} />
              ) : null}
              {typeof row.landedToman === 'number' ? (
                <Stat label={`تحویل ${block.city ?? ''}`.trim()} value={formatToman(row.landedToman)} />
              ) : null}
            </div>

            <div className={styles.compareFoot}>
              {row.movementDir ? <MovementBadge dir={row.movementDir} pct={row.movementPct} /> : null}
              {/* An average over ONE row is not an average — say so, rather
                  than letting a single quote pass for a market reading. */}
              {row.rowCount === 1 ? <span className={styles.compareNote}>تک‌منبع</span> : null}
            </div>
          </li>
        ))}
      </ul>

      {typeof block.savingsVsNextToman === 'number' && block.savingsVsNextToman > 0 ? (
        <p className={styles.compareSaving}>
          <CheckCircleIcon size={15} aria-hidden="true" />
          <span>
            انتخاب ارزان‌ترین گزینه نسبت به گزینهٔ بعدی{' '}
            <strong className="tnum">{formatToman(block.savingsVsNextToman)}</strong> صرفه دارد.
          </span>
        </p>
      ) : null}

      {showLanded && block.originLabel ? (
        <p className={styles.compareNoteBlock}>
          ستون تحویل، بار را از {toPersianDigits(block.originLabel)} تا {toPersianDigits(block.city ?? '')} با
          کرایه، بارگیری، بیمه و باسکول حساب کرده است؛ عدد نهایی را کارشناس در پیش‌فاکتور تأیید می‌کند.
        </p>
      ) : null}

      {block.excludedNonKg ? (
        <p className={styles.compareNoteBlock}>
          {toPersianDigits(block.excludedNonKg)} ردیف قیمتش کیلویی نیست و در این مقایسه نیامده.
        </p>
      ) : null}

      <Freshness at={block.updatedAt} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() =>
            onPick(
              `از ${block.rows.find((r) => r.cheapestLanded)?.factory ?? block.rows[0]?.factory ?? ''} پیش‌فاکتور می‌خواهم`,
            )
          }
        >
          پیش‌فاکتور از ارزان‌ترین
        </button>
        {!showLanded ? (
          <button
            type="button"
            className={styles.actionGhost}
            onClick={() => onPick('با احتساب کرایهٔ حمل تا شهرم هم حساب کن')}
          >
            با کرایهٔ حمل حساب کن
          </button>
        ) : null}
        <button
          type="button"
          className={styles.actionGhost}
          onClick={() => onPick(`روند قیمت ${block.title} را نشانم بده`)}
        >
          روند قیمت
        </button>
      </div>
    </div>
  );
}
