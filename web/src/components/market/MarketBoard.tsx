'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { marketValues as fallbackValues } from '@/lib/mock/fixtures';
import { API_MODE } from '@/lib/api/config';
import { marketApi } from '@/lib/api/resources/market';
import { useMarket } from '@/lib/hooks/useMarket';
import type { MarketValue } from '@/lib/types/domain';
import { MovementBadge, EmptyState, emptyPresets } from '@/components/ui';
import { PriceChart } from '@/components/catalog/PriceChart';
import { AlertBellButton } from '@/components/alerts/AlertBellButton';
import { InfoIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './MarketBoard.module.css';

/**
 * تابلوی بازار — the FX / gold / billet board. Five calm cards (دلار، یورو،
 * طلای ۱۸، انس جهانی، شمش فولاد); selecting one reveals its price history below.
 * Billet (شمش) is admin-entered; the rest are tgju-backed. Values come from
 * `useMarket()` (the same live-polled hook the header Ticker uses) — a mock
 * fallback only covers the brief pre-load flash, not live mode itself.
 */

/** Big value: Toman ones via formatToman; ounce (unit دلار) via Persian digits. */
function formatValue(v: MarketValue): { num: string; unit: string } {
  if (v.unit === 'تومان') {
    return { num: formatToman(v.value, false), unit: 'تومان' };
  }
  return { num: toPersianDigits(v.value.toLocaleString('en-US').replace(/,/g, '٬')), unit: v.unit };
}

function SourceBadge({ source }: { source: MarketValue['source'] }) {
  // Admin-entered values (شمش فولاد) show no source badge at all — the
  // «درج‌شده توسط آهن‌تایم» label was internal plumbing detail, not
  // something a visitor needs to see on every card.
  if (source === 'admin') {
    return null;
  }
  return (
    <span className={styles.source}>
      <span className={styles.sourceDot} aria-hidden="true" />
      نرخ لحظه‌ای بازار
    </span>
  );
}

export function MarketBoard() {
  const { data, isLoading, refetch } = useMarket();
  // NEVER fall back to mock fixtures in live mode. Those constants carry
  // `source: 'tgju'` and `isStale: false`, so an empty response painted
  // invented rates badged as fresh market data — measured against live values
  // they were off by 2.3x (usd), 4.8x (gold18) and 1.7x (ounce). On a site
  // whose entire positioning is price transparency that is worse than showing
  // nothing, and it contradicts ERROR-HANDLING.md, which calls for last-known
  // values plus a «با تأخیر» badge — never fabricated ones.
  const marketValues =
    data?.values?.length ? data.values : API_MODE === 'mock' ? fallbackValues : [];

  const first = marketValues[0];
  const [selectedKey, setSelectedKey] = useState<MarketValue['key']>(first?.key ?? 'usd');

  const selected = marketValues.find((v) => v.key === selectedKey) ?? first;

  const { data: history } = useQuery({
    queryKey: ['market', 'history', selected?.key, selected?.value],
    queryFn: () => marketApi.history(selected!.key, selected!.value),
    enabled: Boolean(selected),
    staleTime: 5 * 60 * 1000,
  });
  const series = (history?.points ?? []).map((p) => p.value);

  // No values and nothing in flight means the ticker source is down. Show the
  // no-dead-ends error state rather than an empty grid (empty-states.md).
  if (!marketValues.length) {
    return (
      <div className={styles.board}>
        {isLoading ? null : <EmptyState {...emptyPresets.serverError(() => void refetch())} />}
      </div>
    );
  }

  return (
    <div className={styles.board}>
      <ul className={styles.grid} role="list">
        {marketValues.map((v) => {
          const { num, unit } = formatValue(v);
          const active = v.key === selectedKey;
          return (
            <li key={v.key} className={styles.cardWrap}>
              {/* The bell trigger is a real, independently-clickable <button>
                  (W29 a11y fix — axe nested-interactive, WCAG 4.1.2): it must
                  live outside this button's DOM subtree, not just be visually
                  stacked on top of it. It's positioned in the card's corner
                  via .bellSlot below instead. */}
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
                </span>
              </button>
              <span className={styles.bellSlot}>
                <AlertBellButton
                  variant="subtle"
                  target={{ type: 'market', key: v.key, label: v.label, currentValue: v.value }}
                />
              </span>
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

          {series.length >= 2 ? (
            <PriceChart series={series} unit={selected.unit === 'تومان' ? 'تومان' : selected.unit} />
          ) : (
            <p className={styles.detailHint}>در حال بارگذاری نمودار…</p>
          )}
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
