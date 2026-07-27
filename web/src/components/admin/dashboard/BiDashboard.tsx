'use client';
/**
 * The management console at /admin — built to answer, in reading order, the
 * five questions a steel-desk manager actually opens the panel with:
 *
 *   1. «الان چه چیزی معطل من است؟»  → the action strip (only non-zero queues)
 *   2. «چقدر فروختیم و بهتر شده؟»   → KPI row, window-over-window
 *   3. «روند به کدام سمت است؟»      → revenue combo chart (value bars + count line)
 *   4. «کجا مشتری را از دست می‌دهیم؟» → funnel with STEP conversion + leak flags
 *   5. «کدام کانال/کالا/کارشناس؟»    → channel bars, best sellers, team table
 *
 * Everything is windowed by one range switcher (۷/۳۰/۹۰ روز) so a comparison
 * is never made across mismatched periods. Live-state panels (pipeline mix,
 * open shipments, health) are deliberately NOT windowed — "what is open right
 * now" must not shrink when the range shrinks; each says so in its subtitle.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { routes } from '@/lib/routes';
import { toPersianDigits, formatTomanCompact, formatToman } from '@/lib/utils/format';
import { Chip, TableSkeleton, EmptyState } from '@/components/ui';
import { ComboChart } from '@/components/admin/charts/ComboChart';
import { SalesFunnel } from '@/components/admin/charts/SalesFunnel';
import { DonutChart } from '@/components/admin/charts/DonutChart';
import { BarList } from '@/components/admin/charts/BarList';
import { KpiCard } from './KpiCard';
import styles from './dashboard.module.css';
import ui from '../adminUi.module.css';

const RANGES = [
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد خرید',
  cooperation: 'همکاری',
  tool: 'ابزارها',
  warehouse: 'انبار',
  contact: 'تماس با ما',
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: 'جدید',
  contacted: 'در پیگیری',
  won: 'موفق',
  lost: 'ناموفق',
};

const LEAD_STATUS_COLOR: Record<string, string> = {
  new: 'var(--chart-3)',
  contacted: 'var(--chart-2)',
  won: 'var(--chart-good)',
  lost: 'var(--chart-bad)',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  registered: 'ثبت‌شده',
  confirmed: 'تأییدشده',
  loading: 'بارگیری',
  in_transit: 'در مسیر',
  delivered: 'تحویل‌شده',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  registered: 'var(--chart-3)',
  confirmed: 'var(--chart-2)',
  loading: 'var(--chart-5)',
  in_transit: 'var(--chart-1)',
  delivered: 'var(--chart-good)',
};

export function BiDashboard() {
  const [range, setRange] = useState<number>(30);

  // Two sources on purpose: the operational counters are role-filtered and
  // cheap (60s), the analytics bundle is heavier and needs leads:read — a
  // scoped role gets the action strip without the charts instead of a 404 page.
  const ops = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, refetchInterval: 60_000 });
  const bi = useQuery({
    queryKey: ['admin', 'stats', 'dashboard', range],
    queryFn: () => adminApi.statsDashboard(range),
    refetchInterval: 300_000,
    retry: false,
  });

  const s = ops.data?.stats;
  const d = bi.data;
  const rangeLabel = RANGES.find((r) => r.days === range)?.label ?? '';

  // «نیازمند اقدام» — only queues with work in them; a clear desk shows nothing.
  const queue = [
    s?.newLeads ? { label: 'سرنخ جدید', n: s.newLeads, href: routes.admin.leads(), urgent: true } : null,
    d?.health.unassignedLeads
      ? { label: 'سرنخ بدون مسئول', n: d.health.unassignedLeads, href: routes.admin.leads(), urgent: true }
      : null,
    s?.newMessages ? { label: 'پیام بی‌پاسخ', n: s.newMessages, href: routes.admin.leads(), urgent: true } : null,
    d?.health.expiringProformas
      ? { label: 'پیش‌فاکتور رو به انقضا', n: d.health.expiringProformas, href: routes.admin.leads(), urgent: true }
      : null,
    s?.openRequests ? { label: 'درخواست باز', n: s.openRequests, href: routes.admin.leads(), urgent: false } : null,
    s?.pendingVerifications
      ? { label: 'احراز هویت در انتظار', n: s.pendingVerifications, href: routes.admin.users(), urgent: false }
      : null,
    s?.stalePrices
      ? { label: 'قیمت کهنه', n: s.stalePrices, href: `${routes.admin.pricing()}?stale=1`, urgent: false }
      : null,
    d?.health.smsFailed24h
      ? { label: 'پیامک ناموفق (۲۴ ساعت)', n: d.health.smsFailed24h, href: routes.admin.settings(), urgent: false }
      : null,
    s?.draftArticles
      ? { label: 'پیش‌نویس محتوا', n: s.draftArticles, href: routes.admin.content(), urgent: false }
      : null,
  ].filter((x): x is { label: string; n: number; href: string; urgent: boolean } => x !== null);

  return (
    <div className={styles.sections}>
      <div className={styles.dashHead}>
        <div>
          <h1 className={styles.dashTitle}>داشبورد</h1>
          <p className={styles.dashSub}>
            سنجه‌ها برای «{rangeLabel} کامل گذشته» محاسبه و با دورهٔ هم‌اندازهٔ پیش از آن مقایسه می‌شوند.
          </p>
        </div>
        <div className={styles.rangeSwitch} role="group" aria-label="بازهٔ زمانی گزارش">
          {RANGES.map((r) => (
            <Chip key={r.days} selected={range === r.days} onClick={() => setRange(r.days)}>
              {r.label}
            </Chip>
          ))}
        </div>
      </div>

      {queue.length > 0 ? (
        <section className={styles.actionBar} aria-label="کارهای نیازمند اقدام">
          <span className={styles.actionTitle}>نیازمند اقدام</span>
          <div className={styles.actionItems}>
            {queue.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className={`${styles.actionChip} ${q.urgent ? styles.actionUrgent : ''}`}
              >
                <span className={`${styles.actionNum} tnum`}>{toPersianDigits(q.n)}</span>
                {q.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {bi.isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : bi.isError || !d ? (
        // Scoped roles (content/catalog) legitimately lack leads:read — the
        // analytics simply aren't theirs; the action strip above still works.
        <EmptyState
          size="section"
          headline="گزارش‌های مدیریتی برای دسترسی شما فعال نیست"
          body="کارهای در انتظار شما در نوار بالا نمایش داده می‌شود."
        />
      ) : (
        <>
          <section className={styles.kpiRow}>
            <KpiCard
              label={`ارزش پیش‌فاکتورها (${rangeLabel})`}
              value={d.revenue.current}
              unit="تومان"
              delta={{ value: d.revenue.deltaPct, kind: 'pct' }}
              format={formatTomanCompact}
              meta={
                <>
                  {toPersianDigits(d.revenue.count)} پیش‌فاکتور · دورهٔ قبل:{' '}
                  <span className="tnum">{formatTomanCompact(d.revenue.prior)}</span>
                </>
              }
              series={d.trend.map((t) => t.value)}
            />
            <KpiCard
              label="سرنخ‌های جدید"
              value={d.leads.current}
              delta={{ value: d.leads.deltaPct, kind: 'pct' }}
              meta={<>دورهٔ قبل: <span className="tnum">{toPersianDigits(d.leads.prior)}</span></>}
            />
            <KpiCard
              label="نرخ تبدیل سرنخ به سفارش"
              value={d.conversion.current ?? 0}
              unit="٪"
              delta={{ value: d.conversion.deltaPts, kind: 'pts' }}
              format={(n) => toPersianDigits(n)}
              meta={
                d.conversion.prior !== null ? (
                  <>دورهٔ قبل: <span className="tnum">{toPersianDigits(d.conversion.prior)}٪</span></>
                ) : (
                  'دورهٔ قبل سرنخی نداشت'
                )
              }
            />
            <KpiCard
              label="میانگین ارزش هر معامله"
              value={d.revenue.avgDeal}
              unit="تومان"
              format={formatTomanCompact}
              meta={<>{toPersianDigits(d.orders.current)} سفارش در این دوره</>}
            />
          </section>

          <div className={styles.chartRow2}>
            <Panel title="روند فروش" sub={`ارزش و تعداد پیش‌فاکتورهای صادرشده، روزانه — ${rangeLabel} گذشته`}>
              <ComboChart data={d.trend} />
            </Panel>
            <Panel title="قیف فروش" sub={`سرنوشت سرنخ‌های ایجادشده در ${rangeLabel} گذشته`}>
              <SalesFunnel
                stages={[
                  { label: 'گفتگوی مشاور', value: d.funnel.conversations },
                  { label: 'سرنخ', value: d.funnel.leads },
                  { label: 'پیش‌فاکتور', value: d.funnel.proformas, benchmark: 25 },
                  { label: 'سفارش', value: d.funnel.orders, benchmark: 30 },
                ]}
              />
              <p className={styles.panelNote}>
                درصد هر پله نسبت به پلهٔ بالاتر است. «نشتی» یعنی تبدیل آن پله کمتر از حد انتظار صنعت است.
              </p>
            </Panel>
          </div>

          <div className={styles.chartRow3}>
            <Panel title="کانال‌های ورودی" sub={`سرنخ‌ها به تفکیک منبع — ${rangeLabel} گذشته`}>
              <BarList
                rows={d.bySource.map((b) => ({
                  label: SOURCE_LABEL[b.source] ?? b.source,
                  value: b.leads,
                  display: toPersianDigits(b.leads),
                  sub:
                    b.wonRate !== null ? (
                      <>
                        {toPersianDigits(b.won)} موفق · نرخ موفقیت{' '}
                        <strong>{toPersianDigits(b.wonRate)}٪</strong>
                      </>
                    ) : null,
                }))}
                emptyText="در این بازه سرنخی ثبت نشده است."
              />
            </Panel>
            <Panel title="ترکیب خط لولهٔ فروش" sub="وضعیت همهٔ سرنخ‌های فعال، لحظه‌ای">
              <DonutChart
                centerLabel="سرنخ"
                centerValue={d.leadStatus.reduce((a, b) => a + b.n, 0)}
                slices={d.leadStatus
                  .slice()
                  .sort((a, b) => order(a.status) - order(b.status))
                  .map((x) => ({
                    label: LEAD_STATUS_LABEL[x.status] ?? x.status,
                    value: x.n,
                    color: LEAD_STATUS_COLOR[x.status] ?? 'var(--chart-4)',
                  }))}
              />
            </Panel>
            <Panel title="سفارش‌های در جریان" sub="مرحلهٔ حمل سفارش‌های تحویل‌نشده، لحظه‌ای">
              {d.orderStatus.length > 0 ? (
                <DonutChart
                  centerLabel="سفارش باز"
                  centerValue={d.orderStatus.reduce((a, b) => a + b.n, 0)}
                  slices={d.orderStatus.map((x) => ({
                    label: ORDER_STATUS_LABEL[x.status] ?? x.status,
                    value: x.n,
                    color: ORDER_STATUS_COLOR[x.status] ?? 'var(--chart-4)',
                  }))}
                />
              ) : (
                <p className={styles.panelNote}>سفارش بازی وجود ندارد.</p>
              )}
            </Panel>
          </div>

          <div className={styles.chartRow2}>
            <Panel title="پرفروش‌ترین کالاها" sub={`بر اساس ارزش خطوط پیش‌فاکتور — ${rangeLabel} گذشته`}>
              <BarList
                rows={d.topProducts.map((p) => ({
                  label: p.name,
                  value: p.value,
                  display: `${formatTomanCompact(p.value)} تومان`,
                  sub: <>مقدار: {toPersianDigits(Math.round(p.qty * 100) / 100)}</>,
                  color: 'var(--chart-1)',
                }))}
                emptyText="در این بازه پیش‌فاکتوری صادر نشده است."
              />
            </Panel>
            <Panel title="عملکرد کارشناسان" sub={`سرنخ‌های واگذارشده در ${rangeLabel} گذشته`}>
              {d.team.length > 0 ? (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <caption className="visually-hidden">عملکرد کارشناسان فروش</caption>
                    <thead>
                      <tr>
                        <th scope="col">کارشناس</th>
                        <th scope="col">سرنخ</th>
                        <th scope="col">موفق</th>
                        <th scope="col">نرخ موفقیت</th>
                        <th scope="col">ارزش پیش‌فاکتور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.team.map((t) => (
                        <tr key={t.id}>
                          <td>{t.name}</td>
                          <td className="tnum">{toPersianDigits(t.leads)}</td>
                          <td className="tnum">{toPersianDigits(t.won)}</td>
                          <td className="tnum">{t.wonRate !== null ? `${toPersianDigits(t.wonRate)}٪` : '—'}</td>
                          <td className="tnum">{formatToman(t.value, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.panelNote}>در این بازه سرنخی به کارشناسی واگذار نشده است.</p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Pipeline order for the donut so the mix always reads new → lost. */
function order(status: string): number {
  return ['new', 'contacted', 'won', 'lost'].indexOf(status);
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {sub ? <p className={styles.panelSub}>{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}
