'use client';
/**
 * بازاریابی (W28 rebuild) — what actually brings in money, in toman.
 *
 * The previous version had three structural problems, all fixed here.
 *
 * 1. Its headline numbers were WRONG. Every aggregate sat on top of a
 *    LEFT JOIN, so a lead was counted once per proforma/order it carried:
 *    production showed 10 leads against a true 2, and a channel holding one
 *    won lead reported "3 leads, 3 won". Fixed in `marketingStats()` and
 *    guarded by analyticsFanout.pg.test.ts.
 * 2. It called `leads.source` «کانال‌های جذب» (acquisition channels). It is
 *    not: it records which FORM on our own site produced the lead, so Google,
 *    Instagram and direct traffic all collapse into «جدول قیمت». Renamed to
 *    «فرم‌های ورودی», and real acquisition now has its own table fed by
 *    first-touch UTM capture.
 * 3. It counted things but never showed toman, so "۱۲ موفق" could mean 200
 *    million or 20 billion — the difference the owner is actually deciding on.
 *
 * Also: one range switch drives every panel (the page used to mix 30-day and
 * 90-day windows on one screen, so its own numbers could not be reconciled),
 * every metric states what "good" looks like, and the retention heatmap — a
 * SaaS instrument answering a question a steel merchant cannot act on — is
 * replaced by a dormant-customer call list.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type AttributionRow } from '@/lib/api/resources/admin';
import { toPersianDigits, formatTomanCompact } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { leadSourceLabel } from '@/lib/data/leadSourceLabels';
import { Badge, Chip, EmptyState, Heading, TableSkeleton, Text } from '@/components/ui';
import { Funnel } from '@/components/admin/charts/Funnel';
import ui from '../adminUi.module.css';
import styles from './dashboard.module.css';

const RANGES = [
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
] as const;

/** Matomo reports its referrer buckets under English keys. */
const REFERRER_LABEL: Record<string, string> = {
  direct: 'ورود مستقیم',
  search: 'جستجوی گوگل',
  website: 'سایت‌های دیگر',
  campaign: 'کمپین‌ها',
  social: 'شبکه‌های اجتماعی',
};

const fa = (n: number) => toPersianDigits(n.toLocaleString('en-US').replace(/,/g, '٬'));
const pct = (v: number | null) => (v === null ? '—' : `${toPersianDigits(String(v).replace('.', '٫'))}٪`);

/** Below this a percentage is noise dressed as a signal — two leads with one
 *  win reads «۵۰٪» and would otherwise sit at the top of the table. */
const MIN_LEADS_FOR_RATE = 10;

export function MarketingDashboard() {
  const [range, setRange] = useState<number>(30);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'stats', 'marketing', range],
    queryFn: () => adminApi.statsMarketing(range),
    refetchInterval: 120_000,
  });

  const rangeLabel = RANGES.find((r) => r.days === range)?.label ?? '';

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError || !data)
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="خطا در دریافت آمار"
        primary={{ label: 'تلاش دوباره', onClick: () => refetch() }}
      />
    );

  const { funnel, byEntryForm, byCampaign, untaggedLeads, responseMinutes, repeatRate, sms, dormant, traffic } = data;
  const leadToProforma = funnel.leads > 0 ? Math.round((funnel.proformas / funnel.leads) * 1000) / 10 : null;
  const proformaToOrder = funnel.proformas > 0 ? Math.round((funnel.orders / funnel.proformas) * 1000) / 10 : null;

  // Only 'sent' counts. 'dev_logged' is written by a non-production build and
  // never handed to the operator — the old `status !== 'failed'` counted those
  // as «ارسال موفق», inflating the figure with messages nobody received.
  const smsSent = sms.filter((s) => s.status === 'sent').reduce((n, s) => n + s.n, 0);
  const smsFailed = sms.filter((s) => s.status === 'failed').reduce((n, s) => n + s.n, 0);
  const smsFailRate = smsSent + smsFailed > 0 ? Math.round((smsFailed / (smsSent + smsFailed)) * 1000) / 10 : null;

  return (
    <div className={styles.sections}>
      <div className={styles.rangeSwitch} role="group" aria-label="بازهٔ زمانی گزارش">
        {RANGES.map((r) => (
          <Chip key={r.days} selected={range === r.days} onClick={() => setRange(r.days)}>
            {r.label}
          </Chip>
        ))}
        {isFetching ? <span className={ui.tileHint}>در حال به‌روزرسانی…</span> : null}
      </div>
      <Text color="muted">
        همهٔ اعداد این صفحه برای «{rangeLabel} کامل گذشته» حساب می‌شوند — امروزِ ناتمام شمرده نمی‌شود — و هر دو دقیقه
        خودکار تازه می‌شوند.
      </Text>

      {traffic ? (
        <section className={ui.panel} aria-labelledby="mkt-traffic">
          <Heading level={2} id="mkt-traffic">
            بازدید سایت — {rangeLabel} گذشته
          </Heading>
          <Text color="muted">
            این بخش از سامانهٔ آمار بازدید می‌آید؛ تنها جایی که می‌داند بازدیدکننده‌ها <strong>پیش از</strong> ثبت
            درخواست از کجا آمده‌اند. باقی این صفحه دربارهٔ اتفاق‌های <strong>پس از</strong> ثبت درخواست است.
          </Text>
          <div className={styles.miniTiles}>
            <div className={ui.tile}>
              <span className={ui.tileLabel}>بازدید</span>
              <span className={`${ui.tileValue} tnum`}>{fa(traffic.visits)}</span>
              <span className={ui.tileHint}>{fa(traffic.uniqueVisitors)} بازدیدکنندهٔ یکتا</span>
            </div>
            {traffic.byReferrerType.slice(0, 3).map((r) => (
              <div className={ui.tile} key={r.label}>
                <span className={ui.tileLabel}>{REFERRER_LABEL[r.label] ?? r.label}</span>
                <span className={`${ui.tileValue} tnum`}>{fa(r.visits)}</span>
                <span className={ui.tileHint}>
                  {traffic.visits > 0 ? pct(Math.round((r.visits / traffic.visits) * 1000) / 10) : '—'} از کل بازدید
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={ui.panel} aria-labelledby="mkt-funnel">
        <Heading level={2} id="mkt-funnel">
          مسیر تبدیل درخواست به سفارش — {rangeLabel} گذشته
        </Heading>
        <Text color="muted">
          از درخواست‌هایی که در این بازه ثبت شده‌اند، چند تا به پیش‌فاکتور و چند تا به سفارش رسیدند. همان گروه از ابتدا
          تا انتها دنبال می‌شود، پس درصدها با هم قابل مقایسه‌اند.
        </Text>
        <div className={styles.sectionGrid}>
          <Funnel
            stages={[
              { label: 'درخواست ثبت‌شده', value: funnel.leads },
              { label: 'پیش‌فاکتور صادر شد', value: funnel.proformas },
              { label: 'به سفارش رسید', value: funnel.orders },
            ]}
          />
        </div>
        <p className={ui.muted} style={{ marginBlockStart: 'var(--space-3)' }}>
          درخواست ← پیش‌فاکتور: <strong className="tnum">{pct(leadToProforma)}</strong>
          {' · '}پیش‌فاکتور ← سفارش: <strong className="tnum">{pct(proformaToOrder)}</strong>
        </p>
        <p className={ui.tileHint}>
          در همین بازه {fa(data.aiConversations)} گفتگو با مشاور هوشمند انجام شده. این عدد کنار قیف آمده و نه داخل آن —
          چون مشخص نیست کدام گفتگو به کدام درخواست رسیده، پس نمی‌توان آن را یک پلهٔ قیف حساب کرد.
        </p>
      </section>

      <AttributionTable
        id="mkt-campaign"
        title={`کمپین‌های تبلیغاتی — ${rangeLabel} گذشته`}
        intro="پاسخ به این پرسش که «پولی که خرج تبلیغ کردم، به فروش رسید؟». هر ردیف یک کمپین است و ستون آخر می‌گوید از آن کمپین چقدر فروش قطعی درآمده."
        rows={byCampaign}
        labelOf={(k) => k}
        firstColumn="کمپین"
        empty={
          <EmptyState
            size="inline"
            headline="هنوز بازدیدی با لینک کمپین‌دار ثبت نشده"
            body="برای اندازه‌گیری، به لینکی که در تبلیغ می‌گذارید یک برچسب کمپین اضافه کنید — مثلاً: ahantime.com/?utm_source=instagram&utm_campaign=milgerd-tabestan"
          />
        }
        footNote={
          untaggedLeads > 0
            ? `${fa(untaggedLeads)} درخواست دیگر بدون برچسب کمپین ثبت شده‌اند (ورود مستقیم یا از جستجو) و در این جدول نیامده‌اند.`
            : undefined
        }
      />

      <AttributionTable
        id="mkt-entry"
        title={`فرم‌های ورودی — ${rangeLabel} گذشته`}
        intro="این جدول می‌گوید مشتری از کدام بخش سایت درخواست داده — نه اینکه از کجا وارد سایت شده. برای منبع ورود، جدول کمپین‌ها و بخش بازدید سایت را ببینید."
        rows={byEntryForm}
        labelOf={leadSourceLabel}
        firstColumn="بخش سایت"
        empty={<EmptyState size="inline" headline="در این بازه درخواستی ثبت نشده" />}
      />

      <div className={styles.miniTiles}>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>سرعت اولین پاسخ به مشتری</span>
          <span className={`${ui.tileValue} tnum`}>
            {responseMinutes.median === null ? '—' : `${toPersianDigits(Math.round(responseMinutes.median))} دقیقه`}
          </span>
          <span className={ui.tileHint}>
            نصف درخواست‌ها زودتر از این پاسخ گرفته‌اند
            {responseMinutes.p90 !== null
              ? ` · کندترین ۱۰٪: ${toPersianDigits(Math.round(responseMinutes.p90))} دقیقه`
              : ''}
            {` · بر پایهٔ ${toPersianDigits(responseMinutes.measured)} درخواست`}
          </span>
          <span className={ui.tileHint}>هرچه کمتر بهتر — هدف حرفه‌ای: زیر ۵ دقیقه.</span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>مشتریانی که دوباره برگشتند</span>
          <span className={`${ui.tileValue} tnum`}>{pct(repeatRate.rate)}</span>
          <span className={ui.tileHint}>
            {toPersianDigits(repeatRate.repeat)} نفر از {toPersianDigits(repeatRate.total)} مشتری، بیش از یک درخواست
            داده‌اند
          </span>
          <span className={ui.tileHint}>هرچه بیشتر بهتر — زیر ۲۰٪ یعنی مشتری بعد از خرید اول رها می‌شود.</span>
        </div>
        <div className={ui.tile}>
          <span className={ui.tileLabel}>پیامک‌های ارسال‌شده</span>
          <span className={`${ui.tileValue} tnum`}>{fa(smsSent)}</span>
          <span className={ui.tileHint}>
            ناموفق: <span className={smsFailed > 0 ? ui.tileBad : undefined}>{fa(smsFailed)}</span>
            {smsFailRate !== null ? ` (${pct(smsFailRate)})` : ''}
          </span>
          <span className={ui.tileHint}>اگر بیش از ۵٪ ناموفق بود، اعتبار پنل پیامک را بررسی کنید.</span>
        </div>
      </div>

      <section className={ui.panel} aria-labelledby="mkt-dormant">
        <Heading level={2} id="mkt-dormant">
          مشتریانی که مدتی است سفارش نداده‌اند
        </Heading>
        <Text color="muted">
          کسانی که قبلاً خرید کرده‌اند ولی بیش از ۹۰ روز است سفارشی نداده‌اند — پرارزش‌ترین‌ها اول. روی شماره بزنید تا
          تماس گرفته شود. این فهرست، فهرست تماس این هفتهٔ شماست.
        </Text>
        {dormant.length === 0 ? (
          <EmptyState size="inline" headline="همهٔ مشتریان اخیراً سفارش داده‌اند 🎉" />
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="visually-hidden">مشتریان بدون سفارش اخیر</caption>
              <thead>
                <tr>
                  <th scope="col">مشتری</th>
                  <th scope="col">شماره تماس</th>
                  <th scope="col">آخرین سفارش</th>
                  <th scope="col">بدون سفارش</th>
                  <th scope="col">تعداد سفارش</th>
                  <th scope="col">مجموع خرید</th>
                </tr>
              </thead>
              <tbody>
                {dormant.map((c) => (
                  <tr key={c.userId}>
                    <td>{c.name?.trim() || '—'}</td>
                    <td>
                      {/* A call list's one action is calling — and there is no
                          per-user admin route to link to instead. */}
                      <a href={`tel:${c.mobile}`} dir="ltr">
                        {toPersianDigits(c.mobile)}
                      </a>
                    </td>
                    <td className="tnum">{formatJalali(c.lastOrderAt)}</td>
                    <td className="tnum">{toPersianDigits(c.daysSince)} روز</td>
                    <td className="tnum">{fa(c.ordersTotal)}</td>
                    <td className="tnum">{formatTomanCompact(c.lifetimeToman)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Entry forms and campaigns are the same shape asking the same question, so
 *  they render through one table — the two can be read against each other
 *  without re-learning what a column means. */
function AttributionTable({
  id,
  title,
  intro,
  rows,
  labelOf,
  firstColumn,
  empty,
  footNote,
}: {
  id: string;
  title: string;
  intro: string;
  rows: AttributionRow[];
  labelOf: (key: string) => string;
  firstColumn: string;
  empty: ReactNode;
  footNote?: string;
}) {
  const hasThinRows = rows.some((r) => r.leads < MIN_LEADS_FOR_RATE);
  return (
    <section className={ui.panel} aria-labelledby={id}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      <Text color="muted">{intro}</Text>
      {rows.length === 0 ? (
        empty
      ) : (
        <>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <caption className="visually-hidden">{title}</caption>
              <thead>
                <tr>
                  <th scope="col">{firstColumn}</th>
                  <th scope="col">درخواست</th>
                  <th scope="col">پیش‌فاکتور گرفت</th>
                  <th scope="col">فروش قطعی</th>
                  <th scope="col">نرخ موفقیت</th>
                  <th scope="col">مبلغ فروش</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{labelOf(r.key)}</td>
                    <td className="tnum">{fa(r.leads)}</td>
                    <td className="tnum">{fa(r.withProforma)}</td>
                    <td className="tnum">{fa(r.won)}</td>
                    <td className="tnum">
                      {r.leads < MIN_LEADS_FOR_RATE ? <Badge tone="stale">کم‌تعداد</Badge> : pct(r.wonRate)}
                    </td>
                    <td className="tnum">{r.wonToman > 0 ? formatTomanCompact(r.wonToman) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasThinRows ? (
            <p className={ui.tileHint}>
              ردیف‌های «کم‌تعداد» کمتر از ۱۰ درخواست دارند؛ درصدشان قابل اتکا نیست و عمداً نمایش داده نمی‌شود.
            </p>
          ) : null}
          {footNote ? <p className={ui.tileHint}>{footNote}</p> : null}
        </>
      )}
    </section>
  );
}
