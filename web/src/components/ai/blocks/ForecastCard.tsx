import type { ForecastBlock, ForecastConfidence, ForecastDirection } from '@/lib/ai/blocks';
import { toPersianDigits } from '@/lib/utils/format';
import { InfoIcon } from '@/components/primitives/icons';
import { Sparkline } from './Sparkline';
import { CardHead, Freshness } from './parts';
import styles from './blocks.module.css';

/**
 * «چشم‌انداز قیمت» — a direction and a band, never a price for a date.
 *
 * The design does the same job the arithmetic does (see server/ai/forecast.ts):
 * make the uncertainty impossible to miss. The headline is a WORD («رو به
 * بالا»), not a number, so nothing here can be screenshotted as a quote. The
 * band is a percentage range drawn as a range. Confidence is stated in plain
 * Persian rather than as a percentage, because a numeric confidence invites
 * exactly the false precision the whole feature is built to avoid. And the
 * caveat is part of the card, not a footnote the model might forget to say —
 * a rule the model can break, a rendered component cannot.
 *
 * The drivers are listed even when they correlate with nothing. Showing «طلای
 * ۱۸ عیار · همبستگی ۰٫۰۴» is the card demonstrating that it looked and found
 * no relationship, which is more trustworthy than quietly omitting it.
 */
const DIR_LABEL: Record<ForecastDirection, string> = {
  up: 'رو به بالا',
  down: 'رو به پایین',
  flat: 'کم‌نوسان',
};
const DIR_ARROW: Record<ForecastDirection, string> = { up: '▲', down: '▼', flat: '■' };
const CONFIDENCE_LABEL: Record<ForecastConfidence, string> = {
  high: 'اتکای نسبتاً خوب',
  medium: 'اتکای متوسط',
  low: 'اتکای کم',
};

/** «۲٫۵٪» with Persian digits and the Persian decimal separator. */
function pct(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${toPersianDigits(Math.abs(n).toFixed(1).replace(/\.0$/, '')).replace('.', '٫')}٪`;
}

export function ForecastCard({ block, onPick }: { block: ForecastBlock; onPick: (text: string) => void }) {
  const tone =
    block.direction === 'up' ? styles.fcUp : block.direction === 'down' ? styles.fcDown : styles.fcFlat;

  return (
    <div className={styles.card}>
      <CardHead badge="چشم‌انداز قیمت" title={block.title} subtitle={block.horizonLabel} />

      <div className={`${styles.fcHeadline} ${tone}`}>
        <span className={styles.fcArrow} aria-hidden="true">
          {DIR_ARROW[block.direction]}
        </span>
        <span className={styles.fcDir}>{DIR_LABEL[block.direction]}</span>
        <span className={styles.fcConfidence}>{CONFIDENCE_LABEL[block.confidence]}</span>
      </div>

      <p className={styles.fcBand}>
        <span className={styles.statLabel}>بازهٔ تقریبی تغییر در {block.horizonLabel}</span>
        <span className={`${styles.fcBandValue} tnum`}>
          {/* LTR so «−۲٫۱٪ تا +۴٫۳٪» reads low-to-high, not reversed by the RTL run. */}
          <bdi dir="ltr">
            {pct(block.bandLowPct)} … {pct(block.bandHighPct)}
          </bdi>
        </span>
      </p>

      <p className={styles.fcReason}>{block.reason}</p>

      {block.trend ? (
        <Sparkline
          values={block.trend.values}
          dates={block.trend.dates}
          changePct={block.ownChangePct}
          label={`روند قیمت ${block.title} در ${toPersianDigits(block.basedOnDays)} روز گذشته:`}
        />
      ) : null}

      {block.drivers.length > 0 ? (
        <ul className={styles.fcDrivers}>
          {block.drivers.map((d) => (
            <li key={d.label}>
              <span className={styles.fcDriverLabel}>{d.label}</span>
              <span className={`${styles.fcDriverNums} tnum`}>
                <bdi dir="ltr">{pct(d.changePct)}</bdi>
                <span className={styles.fcDriverCorr}>
                  همبستگی <bdi dir="ltr">{toPersianDigits(d.correlation.toFixed(2)).replace('.', '٫')}</bdi>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Not a footnote and not optional: this is the sentence that keeps a
          directional read from being taken as a commitment, and it is rendered
          rather than left to the model to remember. */}
      <p className={styles.fcCaveat}>
        <InfoIcon size={14} aria-hidden="true" />
        <span>
          این یک برآورد جهت‌دار از روی داده‌های گذشته است، نه قیمت قطعی. بازار آهن با خبر و نرخ ارز
          یک‌شبه جابه‌جا می‌شود؛ قیمت معتبر همان قیمتی است که در پیش‌فاکتور همان روز ثبت می‌شود.
        </span>
      </p>

      <Freshness at={block.updatedAt} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() => onPick(`برای ${block.title} پیش‌فاکتور امروز را بگیر`)}
        >
          پیش‌فاکتور با قیمت امروز
        </button>
        <button
          type="button"
          className={styles.actionGhost}
          onClick={() => onPick(`اگر قیمت ${block.title} پایین آمد به من خبر بده`)}
        >
          هشدار قیمت
        </button>
      </div>
    </div>
  );
}
