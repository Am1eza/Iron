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
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './MarketBoard.module.css';

/**
 * تابلوی بازار — the FX / gold / billet board. Five calm cards (دلار، یورو،
 * طلای ۱۸، انس جهانی، شمش فولاد); selecting one reveals its price history below.
 * Billet (شمش) is fed from esfahanahan (with an admin override); the rest are
 * tgju-backed. Values come from
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

/** Same badge on every card regardless of `source` — a deliberate choice
 * (Amir, 2026-08-15): all 5 card headers must line up on an identical row,
 * label-then-badge, with no per-card structural difference. شمش فولاد is now
 * polled too (every 15 min from esfahanahan, vs 60s for the other four, since
 * its upstream reprices a few times a day) — this label is a uniform visual
 * category, not a claim that every card's *number* refreshes at one cadence. */
function SourceBadge() {
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
    // '1y' — PriceChart owns its own week/month/3-month/year tabs and slices
    // this client-side; fetching only the server's 30d default made the
    // 3-month/year tabs literally incapable of showing more than a month,
    // no matter which tab was selected.
    queryFn: () => marketApi.history(selected!.key, selected!.value, '1y'),
    enabled: Boolean(selected),
    staleTime: 5 * 60 * 1000,
  });
  const points = history?.points ?? [];
  const series = points.map((p) => p.value);
  // Real per-point timestamps for the chart's data-table fallback: the series
  // is one point per day but with gaps (non-trading days), so the chart must
  // NOT reconstruct dates by assuming consecutive days.
  const chartDates = points.map((p) => p.at);

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
                  <SourceBadge />
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
            <SourceBadge />
          </div>

          {series.length >= 2 ? (
            <PriceChart
              series={series}
              dates={chartDates}
              unit={selected.unit === 'تومان' ? 'تومان' : selected.unit}
            />
          ) : (
            <p className={styles.detailHint}>در حال بارگذاری نمودار…</p>
          )}
        </section>
      ) : null}


      <div className={styles.ctaRow}>
        <Link href={routes.prices()} className={styles.cta}>
          مشاهدهٔ قیمت آهن‌آلات
          <ChevronStartIcon size={18} className="icon--rtl" />
        </Link>
      </div>
    </div>
  );
}
