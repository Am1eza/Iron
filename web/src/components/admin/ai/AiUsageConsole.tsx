'use client';
/**
 * AI usage console (US-24.3) — daily token/violation trend from `aiUsage`.
 * Token counts only, not a Toman/USD "cost": this app has no sourced
 * DeepSeek pricing anywhere, so a currency figure here would be invented,
 * not measured.
 */
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { EmptyState, TableSkeleton } from '@/components/ui';
import { Sparkline } from '../dashboard/Sparkline';
import ui from '../adminUi.module.css';

function Stat({ label, value, series }: { label: string; value: string; series: number[] }) {
  return (
    <div className={ui.tile}>
      <span className={ui.tileLabel}>{label}</span>
      <span className={`${ui.tileValue} tnum`}>{value}</span>
      <Sparkline data={series} width={140} height={32} />
    </div>
  );
}

export function AiUsageConsole() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'ai-usage'],
    queryFn: () => adminApi.aiUsage(14),
  });

  if (isLoading) return <TableSkeleton rows={4} cols={4} />;
  if (isError || !data) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="بارگذاری آمار مصرف ناموفق بود."
        primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
      />
    );
  }

  const { series } = data;
  const totalPrompt = series.reduce((s, d) => s + d.promptTokens, 0);
  const totalCompletion = series.reduce((s, d) => s + d.completionTokens, 0);
  const totalCacheHit = series.reduce((s, d) => s + d.cacheHitTokens, 0);
  const totalViolations = series.reduce((s, d) => s + d.violations, 0);
  const cacheHitRate = totalPrompt > 0 ? Math.round((totalCacheHit / totalPrompt) * 100) : 0;
  // J-219: a MONITORING number, not a guardrail count. It measures how often
  // the model made a tool query more specific than the visitor's own words —
  // the behaviour that could quietly resolve an ambiguity the choice chips
  // exist to surface. The decision about whether to block it waits for this
  // rate; see lib/server/ai/queryRewrite.ts.
  const totalTurns = series.reduce((s, d) => s + d.turns, 0);
  const totalRewrites = series.reduce((s, d) => s + d.queryRewriteTurns, 0);
  const rewriteRate = totalTurns > 0 ? Math.round((totalRewrites / totalTurns) * 100) : 0;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Stat
          label="توکن ورودی (۱۴ روز)"
          value={toPersianDigits(totalPrompt.toLocaleString('en-US'))}
          series={series.map((d) => d.promptTokens)}
        />
        <Stat
          label="توکن خروجی (۱۴ روز)"
          value={toPersianDigits(totalCompletion.toLocaleString('en-US'))}
          series={series.map((d) => d.completionTokens)}
        />
        <Stat
          label="نرخ برخورد کش"
          value={`${toPersianDigits(cacheHitRate)}٪`}
          series={series.map((d) => d.cacheHitTokens)}
        />
        <Stat
          label="نقض گاردریل (۱۴ روز)"
          value={toPersianDigits(totalViolations)}
          series={series.map((d) => d.violations)}
        />
        <Stat
          label="نرخ بازنویسی پرس‌وجو"
          value={`${toPersianDigits(rewriteRate)}٪`}
          series={series.map((d) => d.queryRewriteTurns)}
        />
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <caption className="visually-hidden">مصرف روزانهٔ دستیار هوشمند در ۱۴ روز اخیر</caption>
          <thead>
            <tr>
              <th scope="col">تاریخ</th>
              <th scope="col">توکن ورودی</th>
              <th scope="col">توکن خروجی</th>
              <th scope="col">برخورد کش</th>
              <th scope="col">نقض</th>
              <th scope="col">بازنویسی پرس‌وجو</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((d) => (
              <tr key={d.date}>
                <td className="tnum">{formatJalali(d.date)}</td>
                <td className="tnum">{toPersianDigits(d.promptTokens.toLocaleString('en-US'))}</td>
                <td className="tnum">
                  {toPersianDigits(d.completionTokens.toLocaleString('en-US'))}
                </td>
                <td className="tnum">
                  {toPersianDigits(d.cacheHitTokens.toLocaleString('en-US'))}
                </td>
                <td className="tnum">{toPersianDigits(d.violations)}</td>
                <td className="tnum">
                  {toPersianDigits(d.queryRewriteTurns)}
                  {d.turns > 0 ? ` / ${toPersianDigits(d.turns)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
