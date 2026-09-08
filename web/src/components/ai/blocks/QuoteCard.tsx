import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import type { QuoteBlock } from '@/lib/ai/blocks';
import { localizeDigits } from '@/lib/utils/format';
import { MovementBadge, PriceTag, DeliveryBadge } from '@/components/ui/PriceParts';
import type { AppLocale } from '@/i18n/config';
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
  const t = useTranslations('ai.blocks');
  const locale = useLocale() as AppLocale;
  const meta = [block.factory, block.size ? t('sizeLabel', { size: block.size }) : '', block.grade].filter(
    Boolean,
  );

  return (
    <div className={styles.card}>
      <CardHead badge={t('badges.quote')} title={block.name} />
      {meta.length > 0 ? (
        <p className={styles.meta}>
          {meta.map((m, i) => (
            <span key={m}>
              {i > 0 ? <span className={styles.metaSep}> · </span> : null}
              {localizeDigits(m!, locale)}
            </span>
          ))}
        </p>
      ) : null}

      <div className={styles.priceRow}>
        {block.price === null ? (
          <span className={styles.priceAsk}>{t('priceAsk')}</span>
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
          label={t('trendOfLabel', { name: block.name })}
        />
      ) : null}

      <Freshness at={block.updatedAt} stale={block.isStale} />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={() => onPick(`قیمت ${block.name} را در همهٔ کارخانه‌ها مقایسه کن`)}
        >
          {t('actions.compareFactories')}
        </button>
        <button
          type="button"
          className={styles.actionGhost}
          onClick={() => onPick(`برای ${block.name} پیش‌فاکتور می‌خواهم`)}
        >
          {t('actions.proforma')}
        </button>
        {block.href ? (
          <Link href={block.href} className={styles.actionLink}>
            {t('actions.productPage')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
