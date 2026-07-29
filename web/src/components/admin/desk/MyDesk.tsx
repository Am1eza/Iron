'use client';
/**
 * «میز کار من» — a sales rep's personal WORK SURFACE (not a report).
 *
 * Everything the rep owns lands in ONE queue ordered by urgency
 * (عقب‌افتاده → امروز → روزهای آینده → بقیه) with the actions needed to move a
 * lead forward available on the row itself. The previous version showed two
 * disconnected read-only tables and every single action — even "I called
 * them" — required navigating out to /admin/leads/[id] and back, which is why
 * reps worked the CRM list instead of their own desk.
 *
 * Backed by GET /api/admin/my/desk (scoped to session.id); writes go through
 * the already-existing PATCH /api/admin/leads/{id} and POST .../notes.
 */
import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { adminApi, type DeskLead, type DeskList } from '@/lib/api/resources/admin';
import { toUserMessage } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { callbackPresets, tomorrowAt9 } from '@/lib/utils/callbackPresets';
import { useToast } from '@/lib/hooks/useToast';
import { Badge, Button, EmptyState, Heading, Modal, TableSkeleton, Text } from '@/components/ui';
import { KpiCard } from '../dashboard/KpiCard';
import ui from '../adminUi.module.css';
import s from './MyDesk.module.css';

/* -------------------------------- labels --------------------------------- */

const STATUS_LABEL: Record<string, string> = {
  new: 'جدید',
  contacted: 'در تماس',
  won: 'موفق',
  lost: 'ناموفق',
};
const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد',
  cooperation: 'همکاری',
  tool: 'ابزار',
  warehouse: 'انبار',
  contact: 'تماس',
};

type Bucket = 'overdue' | 'today' | 'upcoming' | 'rest';

// `className` is optional because CSS-module lookups are `string | undefined`
// under noUncheckedIndexedAccess — and the رست bucket genuinely has no accent.
const BUCKET: Record<Bucket, { title: string; hint: string; className?: string }> = {
  overdue: {
    title: 'عقب‌افتاده',
    hint: 'زمان تماسشان گذشته — پیش از هر کار دیگری اینها.',
    className: s.groupOverdue,
  },
  today: { title: 'امروز', hint: 'تماس‌های زمان‌بندی‌شدهٔ امروز.', className: s.groupToday },
  upcoming: { title: 'روزهای آینده', hint: 'تماس‌های زمان‌بندی‌شدهٔ بعدی.', className: s.groupUpcoming },
  // Deliberately not «بدون زمان تماس»: when a callback list is capped, the
  // leftover rows DO have a callbackAt and fall through to here, so a
  // "no callback" title would be a lie exactly when the desk is busiest.
  rest: {
    title: 'سایر سرنخ‌های در جریان',
    hint: 'سرنخ‌های فعالی که در دسته‌های بالا نیستند — اغلب هنوز زمان تماسی برایشان ثبت نشده.',
  },
};

const fa = (v: string | number) => toPersianDigits(v);

/* -------------------------------- helpers -------------------------------- */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** «۲ روز تأخیر» / «۳ ساعت تأخیر» — how stale a missed call is, because a call
 *  missed this morning is a different job from one missed in اسفند. */
function lateness(from: Date, now: Date): string {
  const mins = Math.max(1, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${fa(mins)} دقیقه تأخیر`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${fa(hours)} ساعت تأخیر`;
  return `${fa(Math.floor(hours / 24))} روز تأخیر`;
}

/** The TIME is half the information: a ۰۹:۰۰ and an ۱۸:۰۰ callback are two
 *  different appointments, and the old date-only cell made them identical.
 *  Whether the call is late is NOT decided here — `isOverdue` comes from the
 *  server, judged against one clock for the whole response; this only renders
 *  how late, which needs a live clock anyway. */
function describeCallback(iso: string, now: Date, isOverdue = false): { main: string; sub?: string } {
  const at = new Date(iso);
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const day = days === 0 ? 'امروز' : days === 1 ? 'فردا' : days === -1 ? 'دیروز' : formatJalali(at);
  return {
    main: `${day} · ${formatJalali(at, 'HH:mm')}`,
    sub: isOverdue ? lateness(at, now) : undefined,
  };
}

// callbackPresets/tomorrowAt9 moved to lib/utils/callbackPresets.ts — shared
// with the CRM's call-outcome capture so "فردا ۹:۰۰" means the same instant
// wherever a rep sees the button.

interface QueueRow {
  lead: DeskLead;
  when: { main: string; sub?: string } | null;
}
interface QueueGroup {
  bucket: Bucket;
  rows: QueueRow[];
  /** Exact count for the bucket where the server can give one. */
  count: number;
  /** Set only when the server withheld rows from this bucket. */
  capped: { shown: number; total: number } | null;
}

/* -------------------------------- component ------------------------------- */

export function MyDesk() {
  const toast = useToast();
  const qc = useQueryClient();
  const queueHeadingId = useId();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'my', 'desk'],
    queryFn: () => adminApi.myDesk(),
    refetchInterval: 60_000,
  });

  // The desk feeds (and is fed by) the CRM list, the dashboard counters and the
  // header alert bell — all four read the same leads, so one write refreshes
  // all four rather than leaving a rep looking at two disagreeing numbers.
  const invalidate = (leadId: string) => {
    void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'leads'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'lead', leadId] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  const patchLead = useMutation({
    mutationFn: (v: { id: string; patch: { status?: string; callbackAt?: string | null }; done: string }) =>
      adminApi.updateLead(v.id, v.patch),
    onSuccess: (_res, v) => {
      toast.success(v.done);
      invalidate(v.id);
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const addNote = useMutation({
    mutationFn: (v: { id: string; text: string }) => adminApi.addLeadNote(v.id, v.text),
    onSuccess: (_res, v) => {
      toast.success('یادداشت ثبت شد.');
      setNote('');
      invalidate(v.id);
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const setCallback = (lead: DeskLead, at: Date | null, label: string) =>
    patchLead.mutate({
      id: lead.id,
      patch: { callbackAt: at ? at.toISOString() : null },
      done: at ? `زمان تماس ${lead.ref} روی ${label} تنظیم شد.` : `زمان تماس ${lead.ref} حذف شد.`,
    });

  /**
   * ONE queue out of three server lists.
   *
   * `active` is a superset of both callback lists (they are the open leads that
   * happen to have a callbackAt), so rows are claimed most-urgent-first and a
   * lead can only ever appear once. `overdue` comes pre-split by the server —
   * we never re-judge it against the browser clock — and only `upcoming` is cut
   * into today/later here, since "today" is a local-calendar question the
   * server has no timezone for.
   */
  const { groups, now } = useMemo(() => {
    const clock = new Date();
    if (!data) return { groups: [] as QueueGroup[], now: clock };

    const endOfToday = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate(), 23, 59, 59, 999);
    const claimed = new Set<string>();
    const claim = (rows: DeskLead[]) =>
      rows.filter((r) => {
        if (claimed.has(r.id)) return false;
        claimed.add(r.id);
        return true;
      });

    const overdue = claim(data.callbacks.overdue.rows);
    const ahead = claim(data.callbacks.upcoming.rows);
    const today: DeskLead[] = [];
    const later: DeskLead[] = [];
    for (const r of ahead) {
      (r.callbackAt && new Date(r.callbackAt) <= endOfToday ? today : later).push(r);
    }
    const rest = claim(data.active.rows);

    // Open leads with a callback are exactly the two callback lists, so what is
    // left over is an exact count — no double-counting the rows shown above.
    // Clamped because a lead whose callback was capped out of its bucket falls
    // through to `rest`, which can push the shown count past the derived total.
    const restTotal = Math.max(
      rest.length,
      data.active.total - data.callbacks.overdue.total - data.callbacks.upcoming.total,
    );

    const row = (lead: DeskLead): QueueRow => ({
      lead,
      when: lead.callbackAt ? describeCallback(lead.callbackAt, clock, lead.isOverdue) : null,
    });
    const capped = (shown: number, list: DeskList) =>
      list.hasMore ? { shown, total: list.total } : null;

    const built: QueueGroup[] = [
      {
        bucket: 'overdue',
        rows: overdue.map(row),
        count: data.callbacks.overdue.total,
        capped: capped(overdue.length, data.callbacks.overdue),
      },
      {
        bucket: 'today',
        rows: today.map(row),
        count: today.length,
        // The upcoming cap covers today+later jointly; pin the notice to the
        // last bucket that actually drew from it, so it is never orphaned.
        capped: later.length === 0 ? capped(ahead.length, data.callbacks.upcoming) : null,
      },
      {
        bucket: 'upcoming',
        rows: later.map(row),
        count: later.length,
        capped: later.length > 0 ? capped(ahead.length, data.callbacks.upcoming) : null,
      },
      {
        bucket: 'rest',
        rows: rest.map(row),
        count: restTotal,
        capped: rest.length < restTotal ? { shown: rest.length, total: restTotal } : null,
      },
    ];
    return { groups: built.filter((g) => g.rows.length > 0), now: clock };
  }, [data]);

  const sheetLead = useMemo(() => {
    if (!sheetId || !data) return null;
    const all = [
      ...data.callbacks.overdue.rows,
      ...data.callbacks.upcoming.rows,
      ...data.active.rows,
    ];
    return all.find((l) => l.id === sheetId) ?? null;
  }, [sheetId, data]);

  if (isLoading) return <TableSkeleton rows={6} cols={5} label="در حال بارگذاری میز کار" />;

  if (isError || !data) {
    return (
      <EmptyState
        size="section"
        tone="error"
        headline="خطا در دریافت میز کار"
        // The server's own Persian message (session expired, no DB, …) — the
        // generic headline alone left the rep with nothing to act on.
        body={toUserMessage(error)}
        primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        secondary={{ label: 'رفتن به سرنخ‌ها', href: routes.admin.leads() }}
      />
    );
  }

  const { stats } = data;
  const busyId = patchLead.isPending ? patchLead.variables?.id : addNote.isPending ? addNote.variables?.id : undefined;

  return (
    <div className={s.desk}>
      {/* KpiCard, not ui.tile: these five are the same KPIs the /admin dashboard
          shows, and reps read both surfaces. ui.tile renders fine now that its
          border bug is fixed, but it has no room for a delta chip and no unit
          slot, so «٪» ended up glued onto the value. Sharing the primitive also
          means one place to change when the BI cards evolve. */}
      <section aria-labelledby={`${queueHeadingId}-kpi`}>
        <Heading level={2} id={`${queueHeadingId}-kpi`} className="visually-hidden">
          شاخص‌های من
        </Heading>
        <div className={s.kpis}>
          <KpiCard label="سرنخ‌های من" value={stats.assigned} meta="مجموع واگذارشده به شما" />
          <KpiCard label="در جریان" value={stats.active} meta="جدید + در تماس" />
          <KpiCard label="موفق" value={stats.won} meta="بسته‌شدهٔ موفق" />
          <KpiCard label="ناموفق" value={stats.lost} meta="بسته‌شدهٔ ناموفق" />
          <KpiCard
            label="نرخ تبدیل"
            value={stats.conversionPct ?? 0}
            unit={stats.conversionPct === null ? undefined : '٪'}
            meta="موفق ÷ (موفق + ناموفق)"
            // null ≠ zero: no decided lead yet means the rate is undefined, and
            // printing «۰٪» would read as a failing rep on their first day.
            format={(n) => (stats.conversionPct === null ? '—' : fa(String(n).replace('.', '٫')))}
          />
        </div>
      </section>

      <section aria-labelledby={queueHeadingId}>
        <div className={s.queueHead}>
          <Heading level={2} id={queueHeadingId}>
            صف کاری من
          </Heading>
          {data.callbacks.overdue.total > 0 ? (
            <Badge tone="loss">{fa(data.callbacks.overdue.total)} تماس عقب‌افتاده</Badge>
          ) : null}
          <Text variant="body-sm" color="muted" className={s.groupHint}>
            به‌ترتیب فوریت چیده شده — از بالا شروع کنید.
          </Text>
        </div>

        {groups.length === 0 ? (
          // headingLevel=3: EmptyState's default h2 would sit as a sibling of
          // this section's own h2 and split the page outline in two.
          <EmptyState
            size="section"
            headingLevel={3}
            headline="صف کاری شما خالی است"
            body="سرنخ در جریان یا تماس زمان‌بندی‌شده‌ای ندارید. از فهرست سرنخ‌ها می‌توانید سرنخ تازه بردارید."
            primary={{ label: 'برداشتن سرنخ از فهرست', href: routes.admin.leads() }}
            secondary={{ label: 'داشبورد', href: routes.admin.dashboard() }}
          />
        ) : (
          <div className={s.groups}>
            {groups.map((g) => (
              <QueueSection
                key={g.bucket}
                group={g}
                busyId={busyId}
                onContacted={(lead) =>
                  patchLead.mutate({
                    id: lead.id,
                    patch: { status: 'contacted' },
                    done: `${lead.ref} «در تماس» شد.`,
                  })
                }
                onSnooze={(lead) => setCallback(lead, tomorrowAt9(), `فردا ${fa('9:00')}`)}
                onOpen={(lead) => {
                  setNote('');
                  setSheetId(lead.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick-action sheet: everything that is NOT a safe one-click action —
          arbitrary callback times, notes, and the two terminal statuses — lives
          behind one deliberate open. Terminal statuses in particular must not
          be a mis-click away in a dense table (موفق recomputes the customer's
          club tier). */}
      <Modal
        open={sheetLead !== null}
        onClose={() => setSheetId(null)}
        title={sheetLead ? `اقدام روی ${sheetLead.ref}` : ''}
        footer={
          sheetLead ? (
            <>
              <Link
                className={s.inlineLink}
                href={`${routes.admin.leads()}/${encodeURIComponent(sheetLead.id)}`}
              >
                پروندهٔ کامل سرنخ
              </Link>
              <Button variant="ghost" onClick={() => setSheetId(null)}>
                بستن
              </Button>
            </>
          ) : null
        }
      >
        {sheetLead ? (
          <div className={s.sheet}>
            <div className={s.sheetSection}>
              <Text variant="body-sm">
                {sheetLead.contactName || 'بدون نام'} ·{' '}
                <a className={s.phone} href={`tel:${sheetLead.contactMobile}`} dir="ltr">
                  {fa(sheetLead.contactMobile)}
                </a>
              </Text>
              <Text variant="caption" color="muted">
                {SOURCE_LABEL[sheetLead.source] ?? sheetLead.source} · ثبت {formatJalali(sheetLead.createdAt)}
                {sheetLead.callbackAt
                  ? ` · تماس فعلی ${describeCallback(sheetLead.callbackAt, now).main}`
                  : ' · بدون زمان تماس'}
              </Text>
            </div>

            <div className={s.sheetSection}>
              <Heading level={3}>زمان تماس بعدی</Heading>
              <div className={s.presets}>
                {callbackPresets(new Date()).map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    variant="secondary"
                    loading={patchLead.isPending}
                    onClick={() => setCallback(sheetLead, p.at, p.label)}
                  >
                    {p.label}
                  </Button>
                ))}
                {sheetLead.callbackAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={patchLead.isPending}
                    onClick={() => setCallback(sheetLead, null, '')}
                  >
                    حذف زمان تماس
                  </Button>
                ) : null}
              </div>
            </div>

            <div className={s.sheetSection}>
              <Heading level={3}>یادداشت سریع</Heading>
              <textarea
                className={`${ui.textCell} ${s.noteArea}`}
                placeholder="خلاصهٔ تماس، درخواست مشتری، مانع…"
                aria-label={`یادداشت برای سرنخ ${sheetLead.ref}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className={s.presets}>
                <Button
                  size="sm"
                  loading={addNote.isPending}
                  disabled={note.trim().length === 0}
                  onClick={() => addNote.mutate({ id: sheetLead.id, text: note.trim() })}
                >
                  ثبت یادداشت
                </Button>
              </div>
            </div>

            <div className={s.sheetSection}>
              <Heading level={3}>بستن سرنخ</Heading>
              <Text variant="caption" color="muted">
                اگر دلیل را در کادر بالا بنویسید، همراه «ناموفق» در تاریخچهٔ سرنخ ثبت می‌شود.
              </Text>
              <div className={s.presets}>
                <Button
                  size="sm"
                  loading={patchLead.isPending}
                  onClick={() => {
                    patchLead.mutate({ id: sheetLead.id, patch: { status: 'won' }, done: `${sheetLead.ref} موفق ثبت شد. 🎉` });
                    setSheetId(null);
                  }}
                >
                  موفق
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={patchLead.isPending}
                  onClick={async () => {
                    // Reason first, status second — same order as the lead page,
                    // so a lost reason is never stranded on a lead that failed
                    // to flip (and reporting can rely on the note existing).
                    // A failed note must not block the status change, but it is
                    // still reported — silently dropping it would leave the rep
                    // believing the reason was recorded.
                    const reason = note.trim();
                    if (reason) {
                      await adminApi
                        .addLeadNote(sheetLead.id, `دلیل ناموفق: ${reason}`)
                        .catch((e: unknown) => toast.error(toUserMessage(e)));
                    }
                    patchLead.mutate({ id: sheetLead.id, patch: { status: 'lost' }, done: `${sheetLead.ref} ناموفق ثبت شد.` });
                    setSheetId(null);
                  }}
                >
                  ناموفق
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* --------------------------------- queue --------------------------------- */

function QueueSection({
  group,
  busyId,
  onContacted,
  onSnooze,
  onOpen,
}: {
  group: QueueGroup;
  busyId: string | undefined;
  onContacted: (lead: DeskLead) => void;
  onSnooze: (lead: DeskLead) => void;
  onOpen: (lead: DeskLead) => void;
}) {
  const meta = BUCKET[group.bucket];
  const headingId = useId();
  return (
    <section className={[s.group, meta.className].filter(Boolean).join(' ')} aria-labelledby={headingId}>
      <div className={s.groupHead}>
        <Heading level={3} id={headingId}>
          {meta.title}
        </Heading>
        <Badge tone={group.bucket === 'overdue' ? 'loss' : group.bucket === 'today' ? 'accent' : 'neutral'}>
          {fa(group.count)}
        </Badge>
        <Text variant="caption" color="muted" className={s.groupHint}>
          {meta.hint}
        </Text>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">کد</th>
              <th scope="col">مشتری</th>
              <th scope="col">زمان تماس</th>
              <th scope="col">وضعیت</th>
              <th scope="col">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map(({ lead, when }) => {
              const busy = busyId === lead.id;
              return (
                <tr
                  key={lead.id}
                  className={[lead.isOverdue ? s.rowOverdue : '', busy ? s.rowBusy : ''].filter(Boolean).join(' ')}
                  aria-busy={busy || undefined}
                >
                  <td>
                    <Link className={s.ref} href={`${routes.admin.leads()}/${encodeURIComponent(lead.id)}`}>
                      <bdi>{lead.ref}</bdi>
                    </Link>
                  </td>
                  <td>
                    <span className={s.contact}>
                      <span className={s.contactName}>{lead.contactName || '—'}</span>
                      <a className={s.phone} href={`tel:${lead.contactMobile}`} dir="ltr">
                        {fa(lead.contactMobile)}
                      </a>
                      <span className={s.source}>{SOURCE_LABEL[lead.source] ?? lead.source}</span>
                    </span>
                  </td>
                  <td>
                    <span className={s.when}>
                      {when ? (
                        <>
                          <time className={s.whenMain} dateTime={lead.callbackAt}>
                            {when.main}
                          </time>
                          {when.sub ? <span className={`${s.whenSub} ${s.whenLate}`}>{when.sub}</span> : null}
                        </>
                      ) : (
                        <>
                          <span className={`${s.whenMain} ${s.whenNone}`}>ثبت نشده</span>
                          <span className={s.whenSub}>
                            ثبت سرنخ: <time dateTime={lead.createdAt}>{formatJalali(lead.createdAt)}</time>
                          </span>
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    {/* The tint alone can't carry «overdue»: a stray missed call
                        also shows up in the بدون‌زمان bucket when its callback
                        was capped out of its own list, far from that heading. */}
                    <span className={s.badges}>
                      <Badge tone={lead.status === 'new' ? 'accent' : 'neutral'}>
                        {STATUS_LABEL[lead.status] ?? lead.status}
                      </Badge>
                      {lead.isOverdue ? <Badge tone="loss">عقب‌افتاده</Badge> : null}
                    </span>
                  </td>
                  <td>
                    <span className={s.actions}>
                      {lead.status === 'new' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          aria-label={`تماس گرفتم — سرنخ ${lead.ref}`}
                          onClick={() => onContacted(lead)}
                        >
                          تماس گرفتم
                        </Button>
                      ) : null}
                      {/* One primitive, two meanings: a snooze for a row that
                          already has a callback, and scheduling for one that
                          doesn't — both are the same PATCH. Every aria-label
                          here starts with the visible text (WCAG 2.5.3), so a
                          voice user can say what they read. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`فردا ${fa('9:00')} — تنظیم زمان تماس سرنخ ${lead.ref}`}
                        onClick={() => onSnooze(lead)}
                      >
                        فردا {fa('9:00')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`بیشتر — اقدام‌های سرنخ ${lead.ref}`}
                        onClick={() => onOpen(lead)}
                      >
                        بیشتر
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {group.capped ? (
        <p className={s.truncation}>
          <Text variant="caption" color="muted" as="span">
            فقط {fa(group.capped.shown)} مورد از {fa(group.capped.total)} نمایش داده شده است.
          </Text>
          <Link className={s.inlineLink} href={routes.admin.leads()}>
            دیدن همه در فهرست سرنخ‌ها
          </Link>
        </p>
      ) : null}
    </section>
  );
}
