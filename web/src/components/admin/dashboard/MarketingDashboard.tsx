'use client';
/**
 * بازاریابی — channel attribution (first-touch: leads.source), entry-cohort
 * funnel (last 30 FULL days), speed-to-lead (median/p90), repeat engagement,
 * and SMS delivery. Every number's window is stated on the widget — a metric
 * without its window is a vanity number.
 */
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import ui from '../adminUi.module.css';

const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد درخواست',
  cooperation: 'همکاری',
  tool: 'ابزارها',
  warehouse: 'انبار',
  contact: 'تماس',
};

const fa = (n: number) => toPersianDigits(n.toLocaleString('en-US'));
const pct = (v: number | null) => (v === null ? '—' : `${toPersianDigits(v)}٪`);

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '9rem 1fr 4rem', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span className={ui.muted}>{label}</span>
      <div style={{ background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-pill)', blockSize: 12 }}>
        <div
          style={{
            inlineSize: `${w}%`,
            blockSize: '100%',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-accent)',
          }}
        />
      </div>
      <span className="tnum" style={{ textAlign: 'end' }}>{fa(value)}</span>
    </div>
  );
}

export function MarketingDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'stats', 'marketing'],
    queryFn: () => adminApi.statsMarketing(),
    refetchInterval: 120_000,
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError || !data)
    return (
      <EmptyState size="section" tone="error" headline="خطا در دریافت آمار" primary={{ label: 'تلاش دوباره', onClick: () => refetch() }} />
    );

  const { funnel, bySource, responseMinutes, repeatRate, sms } = data;
  const funnelMax = Math.max(funnel.conversations, funnel.leads, 1);
  const rate = (a: number, b: number) => (b > 0 ? `${toPersianDigits(Math.round((a / b) * 1000) / 10)}٪` : '—');
  const smsSent = sms.filter((s) => s.status !== 'failed').reduce((sum, s) => sum + s.n, 0);
  const smsFailed = sms.filter((s) => s.status === 'failed').reduce((sum, s) => sum + s.n, 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <section className={ui.panel} aria-labelledby="mkt-funnel">
        <Heading level={2} id="mkt-funnel">قیف تبدیل — ۳۰ روز کامل گذشته</Heading>
        <Text color="muted">
          نرخ‌ها روی همان گروه ورودی (cohort) حساب می‌شوند: از سرنخ‌های ساخته‌شده در بازه، چند تا به پیش‌فاکتور/سفارش رسیدند.
        </Text>
        <div style={{ display: 'grid', gap: 'var(--space-3)', marginBlockStart: 'var(--space-4)' }}>
          <FunnelBar label="گفتگو با مشاور" value={funnel.conversations} max={funnelMax} />
          <FunnelBar label="سرنخ (درخواست)" value={funnel.leads} max={funnelMax} />
          <FunnelBar label="پیش‌فاکتور" value={funnel.proformas} max={funnelMax} />
          <FunnelBar label="سفارش" value={funnel.orders} max={funnelMax} />
        </div>
        <p className={ui.muted} style={{ marginBlockStart: 'var(--space-3)' }}>
          سرنخ ← پیش‌فاکتور: <strong className="tnum">{rate(funnel.proformas, funnel.leads)}</strong>
          {' · '}پیش‌فاکتور ← سفارش: <strong className="tnum">{rate(funnel.orders, funnel.proformas)}</strong>
        </p>
      </section>

      <section className={ui.panel} aria-labelledby="mkt-src">
        <Heading level={2} id="mkt-src">کانال‌های جذب — ۹۰ روز گذشته</Heading>
        <Text color="muted">کیفیت مهم‌تر از حجم است: نرخ Won هر کانال را با هم مقایسه کنید، نه فقط تعداد سرنخ.</Text>
        {bySource.length === 0 ? (
          <EmptyState size="inline" headline="هنوز سرنخی ثبت نشده" />
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">کانال</th>
                <th scope="col">سرنخ</th>
                <th scope="col">پیش‌فاکتور</th>
                <th scope="col">Won</th>
                <th scope="col">نرخ Won</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((s) => (
                <tr key={s.source}>
                  <td>{SOURCE_LABEL[s.source] ?? s.source}</td>
                  <td className="tnum">{fa(s.leads)}</td>
                  <td className="tnum">{fa(s.proformas)}</td>
                  <td className="tnum">{fa(s.won)}</td>
                  <td className="tnum">{pct(s.wonRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className={ui.tiles}>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>سرعت پاسخ به سرنخ (میانه)</span>
          <span className={`${ui.tileValue} tnum`}>
            {responseMinutes.median === null ? '—' : `${toPersianDigits(Math.round(responseMinutes.median))} دقیقه`}
          </span>
          <span className={ui.tileHint}>
            p90: {responseMinutes.p90 === null ? '—' : `${toPersianDigits(Math.round(responseMinutes.p90))} دقیقه`} ·{' '}
            {toPersianDigits(responseMinutes.measured)} سرنخ سنجیده‌شده · ۳۰ روز
          </span>
          <span className={ui.tileHint}>هدف حرفه‌ای: زیر ۵ دقیقه — سریع‌ترین پاسخ، بیشترین تبدیل.</span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>نرخ مراجعهٔ مجدد</span>
          <span className={`${ui.tileValue} tnum`}>{pct(repeatRate.rate)}</span>
          <span className={ui.tileHint}>
            {toPersianDigits(repeatRate.repeat)} از {toPersianDigits(repeatRate.total)} کاربرِ دارای سرنخ، ≥۲ درخواست · ۹۰ روز
          </span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>پیامک — ۳۰ روز</span>
          <span className={`${ui.tileValue} tnum`}>{fa(smsSent)}</span>
          <span className={ui.tileHint}>
            ارسال موفق · ناموفق: <span className={smsFailed > 0 ? ui.tileBad : undefined}>{fa(smsFailed)}</span>
          </span>
          <span className={ui.tileHint}>
            {sms.map((s) => `${s.kind}/${s.status}: ${toPersianDigits(s.n)}`).join(' · ') || 'رکوردی نیست'}
          </span>
        </div>
      </div>
    </div>
  );
}
