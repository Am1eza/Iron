'use client';
import { useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { marketValues } from '@/lib/mock/fixtures';
import { priceSeries } from '@/lib/mock/catalogData';
import type { MarketValue } from '@/lib/types/domain';
import { MovementBadge } from '@/components/ui';
import { PriceChart } from '@/components/catalog/PriceChart';
import {
  InfoIcon,
  CheckCircleIcon,
  ChevronStartIcon,
} from '@/components/primitives/icons';
import styles from './MarketBoard.module.css';

/**
 * تابلوی بازار — the FX / gold / billet board. Five calm cards (دلار، یورو،
 * طلای ۱۸، انس جهانی، شمش فولاد); selecting one reveals its price history below.
 * Billet (شمش) is admin-entered; the rest are tgju-backed. Deterministic data,
 * tabular numerals, RTL. No new Date() at render — freshness is a static label.
 */

/** Big value: Toman ones via formatToman; ounce (unit دلار) via Persian digits. */
function formatValue(v: MarketValue): { num: string; unit: string } {
  if (v.unit === 'تومان') {
    return { num: formatToman(v.value, false), unit: 'تومان' };
  }
  return { num: toPersianDigits(v.value.toLocaleString('en-US').replace(/,/g, '٬')), unit: v.unit };
}

function SourceBadge({ source }: { source: MarketValue['source'] }) {
  if (source === 'admin') {
    return (
      <span className={`${styles.source} ${styles.sourceAdmin}`}>
        <CheckCircleIcon size={13} />
        درج‌شده توسط آهن‌تایم
      </span>
    );
  }
  return (
    <span className={styles.source}>
      <span className={styles.sourceDot} aria-hidden="true" />
      نرخ لحظه‌ای بازار
    </span>
  );
}

export function MarketBoard() {
  const first = marketValues[0];
  const [selectedKey, setSelectedKey] = useState<MarketValue['key']>(first?.key ?? 'usd');

  const selected = marketValues.find((v) => v.key === selectedKey) ?? first;

  return (
    <div className={styles.board}>
      <ul className={styles.grid} role="list">
        {marketValues.map((v) => {
          const { num, unit } = formatValue(v);
          const active = v.key === selectedKey;
          return (
            <li key={v.key}>
              <button
                type="button"
                className={styles.card}
                data-active={active ? '' : undefined}
                aria-pressed={active}
                aria-label={`نمایش نمودار ${v.label}`}
                onClick={() => setSelectedKey(v.key)}
              >
                <span className={styles.cardHead}>
                  <span className={styles.label}>{v.label}</span>
                  <SourceBadge source={v.source} />
                </span>
                <span className={styles.valueRow}>
                  <span className={`${styles.value} tnum`}>{num}</span>
                  <span className={styles.unit}>{unit}</span>
                </span>
                <span className={styles.moveRow}>
                  <MovementBadge dir={v.movementDir} pct={v.movementPct} pill />
                  <span className={styles.fresh}>به‌روزرسانی لحظه‌ای</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <section className={styles.detail} aria-label={`نمودار ${selected.label}`}>
          <div className={styles.detailHead}>
            <div>
              <p className={styles.detailLabel}>نمودار {selected.label}</p>
              <p className={styles.detailHint}>
                روند تقریبی قیمت در بازه‌های هفته تا یک‌سال اخیر.
              </p>
            </div>
            <SourceBadge source={selected.source} />
          </div>

          <PriceChart
            series={priceSeries('market:' + selected.key, selected.value)}
            unit={selected.unit === 'تومان' ? 'تومان' : selected.unit}
          />
        </section>
      ) : null}

      <p className={styles.note}>
        <span className={styles.noteIcon} aria-hidden="true">
          <InfoIcon size={18} />
        </span>
        نرخ‌ها لحظه‌ای از بازار دریافت و نرخ شمش فولاد کارشناسی درج می‌شود. این ارقام مبنای معامله
        نیست.
      </p>

      <div className={styles.ctaRow}>
        <Link href={routes.prices()} className={styles.cta}>
          مشاهدهٔ قیمت آهن‌آلات
          <ChevronStartIcon size={18} className="icon--rtl" />
        </Link>
      </div>
    </div>
  );
}
