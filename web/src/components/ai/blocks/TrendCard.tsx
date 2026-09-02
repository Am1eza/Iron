import Link from 'next/link';
import type { TrendBlock } from '@/lib/ai/blocks';
import { toPersianDigits } from '@/lib/utils/format';
import { Sparkline } from './Sparkline';
import { CardHead } from './parts';
import styles from './blocks.module.css';

/**
 * Price history as its own answer — «قیمت میلگرد این ماه چطور بوده؟».
 *
 * Reads the same `price_points` series the product page's full chart is drawn
 * from (via `catalogRepo.skuHistory`), collapsed to one point per calendar day
 * server-side, so the line in the bubble and the line on the product page are
 * the same data at two sizes. The change figure is computed in code, never by
 * the model.
 */
export function TrendCard({ block }: { block: TrendBlock }) {
  const dir = block.changePct === undefined ? 'flat' : block.changePct > 0 ? 'up' : block.changePct < 0 ? 'down' : 'flat';
  const changeText =
    block.changePct === undefined
      ? null
      : `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''} ${toPersianDigits(
          Math.abs(block.changePct).toFixed(1),
        )}٪`;

  return (
    <div className={styles.card}>
      <CardHead badge="روند قیمت" title={block.title} subtitle={block.rangeLabel} />
      <Sparkline
        values={block.values}
        dates={block.dates}
        unitLabel={block.unitLabel}
        changePct={block.changePct}
        label={`روند قیمت ${block.title} در ${block.rangeLabel}:`}
      />
      {changeText ? (
        <p
          className={`${styles.trendChange} ${
            dir === 'up' ? styles.trendUp : dir === 'down' ? styles.trendDown : styles.trendFlat
          } tnum`}
        >
          <span aria-hidden="true">{changeText}</span>
          <span className="visually-hidden">
            {dir === 'up' ? 'افزایش' : dir === 'down' ? 'کاهش' : 'بدون تغییر'}{' '}
            {toPersianDigits(Math.abs(block.changePct!).toFixed(1))} درصد
          </span>
          <span className={styles.trendChangeNote}>در {block.rangeLabel}</span>
        </p>
      ) : null}
      {block.href ? (
        <div className={styles.actions}>
          <Link href={block.href} className={styles.actionLink}>
            نمودار کامل در صفحهٔ محصول
          </Link>
        </div>
      ) : null}
    </div>
  );
}
