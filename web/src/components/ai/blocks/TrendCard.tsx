import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import type { TrendBlock } from '@/lib/ai/blocks';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
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
  const t = useTranslations('ai.blocks');
  const locale = useLocale() as AppLocale;
  const dir = block.changePct === undefined ? 'flat' : block.changePct > 0 ? 'up' : block.changePct < 0 ? 'down' : 'flat';
  const pctDigits =
    block.changePct === undefined ? null : localizeDigits(Math.abs(block.changePct).toFixed(1), locale);
  const changeText =
    pctDigits === null ? null : `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''} ${pctDigits}${locale === 'fa' ? '٪' : '%'}`;

  return (
    <div className={styles.card}>
      <CardHead badge={t('badges.trend')} title={block.title} subtitle={block.rangeLabel} />
      <Sparkline
        values={block.values}
        dates={block.dates}
        unitLabel={block.unitLabel}
        changePct={block.changePct}
        label={t('trendOfRangeLabel', { name: block.title, range: block.rangeLabel })}
      />
      {changeText ? (
        <p
          className={`${styles.trendChange} ${
            dir === 'up' ? styles.trendUp : dir === 'down' ? styles.trendDown : styles.trendFlat
          } tnum`}
        >
          <span aria-hidden="true">{changeText}</span>
          <span className="visually-hidden">
            {t(`trend.change.${dir}`)} {pctDigits} {locale === 'fa' ? 'درصد' : '%'}
          </span>
          <span className={styles.trendChangeNote}>{t('trend.inRange', { range: block.rangeLabel })}</span>
        </p>
      ) : null}
      {block.href ? (
        <div className={styles.actions}>
          <Link href={block.href} className={styles.actionLink}>
            {t('trend.fullChart')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
