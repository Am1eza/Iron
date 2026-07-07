import type { ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import { Sparkline } from './Sparkline';
import ui from '../adminUi.module.css';

/**
 * KPI card: headline number (last 7 FULL days) + delta vs the 7 before +
 * today's partial count + 30-day sparkline. `deltaPct === null` renders
 * «جدید» (prior period was zero — a percent would be ∞/misleading).
 */
export function KpiCard({
  label,
  value,
  deltaPct,
  today,
  series,
  hint,
  format = (n) => toPersianDigits(n.toLocaleString('en-US')),
}: {
  label: string;
  value: number;
  deltaPct: number | null;
  today?: number;
  series?: number[];
  hint?: ReactNode;
  format?: (n: number) => string;
}) {
  const up = deltaPct !== null && deltaPct > 0;
  const down = deltaPct !== null && deltaPct < 0;
  return (
    <div className={ui.tile}>
      <span className={ui.tileLabel}>{label}</span>
      <span className={`${ui.tileValue} tnum`}>{format(value)}</span>
      <span className={ui.tileHint}>
        <span
          className={up ? ui.tileGood : down ? ui.tileBad : undefined}
          aria-label={
            deltaPct === null
              ? 'دورهٔ قبل صفر بود'
              : `${deltaPct > 0 ? 'رشد' : deltaPct < 0 ? 'افت' : 'بدون تغییر'} ${Math.abs(deltaPct)} درصد نسبت به هفتهٔ قبل`
          }
        >
          {deltaPct === null ? 'جدید' : `${up ? '▲' : down ? '▼' : '＝'} ${toPersianDigits(Math.abs(deltaPct))}٪`}
        </span>
        {' · ۷ روز کامل'}
        {today !== undefined ? ` · امروز تا این لحظه: ${toPersianDigits(today)}` : ''}
      </span>
      {series && series.length > 1 ? <Sparkline data={series} /> : null}
      {hint ? <span className={ui.tileHint}>{hint}</span> : null}
    </div>
  );
}
