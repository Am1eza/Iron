'use client';
/** Lead list — status filter + search; a row expands into the detail panel. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi, LEADS_EXPORT_MAX_ROWS, type AdminLead } from '@/lib/api/resources/admin';
import { formatTomanCompact, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useAuthStore } from '@/lib/stores/auth';
import { Badge, Button, Chip, EmptyState, TableSkeleton, Text } from '@/components/ui';
import { LeadDetail } from './LeadDetail';
import { PagerFooter } from '../PagerFooter';
import { JalaliDateField } from '../JalaliDateField';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

/** One source of truth for the column count: the skeleton used to say 5 while
 *  the table had 6, so every load visibly reflowed, and the expanded detail
 *  row's colSpan has to follow too. */
const COLS = 7;

const STATUS_META: Record<AdminLead['status'], { label: string; tone: 'info' | 'action' | 'gain' | 'loss' }> = {
  new: { label: 'جدید', tone: 'info' },
  contacted: { label: 'تماس‌گرفته', tone: 'action' },
  won: { label: 'موفق', tone: 'gain' },
  lost: { label: 'ناموفق', tone: 'loss' },
};

const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد خرید',
  cooperation: 'همکاری',
  tool: 'ابزار',
  warehouse: 'انبار',
  contact: 'تماس',
};

const FILTERS = [
  { id: '', label: 'همه' },
  { id: 'new', label: 'جدید' },
  { id: 'contacted', label: 'تماس‌گرفته' },
  { id: 'won', label: 'موفق' },
  { id: 'lost', label: 'ناموفق' },
];

const STATUS_IDS = FILTERS.map((f) => f.id);

/** Grouped Persian integer — the Toman helpers can't be used for counts and
 *  weights (they'd append «تومان» / compact to «میلیون»). */
const faCount = (n: number) => toPersianDigits(n.toLocaleString('en-US')).replace(/,/g, '٬');

/** Reps quote in tons; «۱۲٫۵ تن» is read at a glance where «۱۲٬۵۰۰ کیلوگرم»
 *  has to be counted digit by digit down a 30-row list. */
function formatWeight(kg: number): string {
  const asTons = kg >= 1000;
  const n = asTons ? Math.round(kg / 100) / 10 : Math.round(kg);
  return `${faCount(n).replace('.', '٫')} ${asTons ? 'تن' : 'کیلوگرم'}`;
}

/** The estimate is customer-entered jsonb — a stray null/string/0 must render
 *  as «بی‌قیمت», never as «۰ کیلوگرم» sitting there looking authoritative. */
function estimateOf(lead: AdminLead): { weightKg?: number; price?: number } {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const est = lead.context?.estimate;
  return { weightKg: num(est?.totalWeightKg), price: num(est?.totalPrice) };
}

export function LeadsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentUser = useAuthStore((st) => st.user);
  const authStatus = useAuthStore((st) => st.status);

  // Every filter lives in the URL, not in useState: a filtered view is what a
  // rep sends to their manager («این ۹ تای معطل‌مانده») and what Back must
  // restore after they open a lead. ?q= also stays the deep-link «میز کار من»
  // uses to hand a rep their queue pre-searched by lead ref.
  const rawStatus = params.get('status') ?? '';
  const status = STATUS_IDS.includes(rawStatus) ? rawStatus : '';
  // Stored as a flag, not as the rep's user id: «سرنخ‌های من» must mean "mine"
  // for whoever opens the link, and a user id in a shared URL is a leak.
  const onlyMine = params.get('mine') === '1';
  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [openId, setOpenId] = useState<string | null>(null);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const qs = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) qs.set(key, value);
        else qs.delete(key);
      }
      // replace, not push: a filter row plus a debounced search would other-
      // wise stack a history entry per keystroke and make Back unusable.
      // scroll:false keeps the toolbar under the cursor where it was.
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // A new filter always jumps back to page 1 — otherwise «صفحهٔ ۵» of the old
  // (much longer) result set can be past the end of the new, filtered one.
  const setFilter = useCallback((patch: Record<string, string | null>) => setParams({ ...patch, page: null }), [setParams]);

  // The search box is the one control that can't be driven straight off the
  // URL — a keystroke per navigation is a re-render per character. It stays
  // local and commits after 300ms; `committed` is what we last wrote, so a
  // Back that changes ?q= syncs the box down instead of the stale keystroke
  // racing the restored value back up.
  const [search, setSearch] = useState(q);
  const committed = useRef(q);
  useEffect(() => {
    if (q !== committed.current) {
      committed.current = q;
      setSearch(q);
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      if (next === committed.current) return;
      committed.current = next;
      setFilter({ q: next || null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, setFilter]);

  // JalaliDateField seeds its Jalali text once (it renders the ISO the caller
  // gave it at mount and owns the box after that), so a Back that restores a
  // date filter would leave the boxes blank beside a visibly filtered list.
  // Remount them on exactly that case: the generation bumps only when the URL
  // holds a date we did not just emit, so it never fires mid-typing and never
  // rewrites a half-typed «۱۴۰۴/۵/» under the caret.
  const emittedDates = useRef({ from, to });
  const [dateKey, setDateKey] = useState(0);
  useEffect(() => {
    if (emittedDates.current.from !== from || emittedDates.current.to !== to) {
      emittedDates.current = { from, to };
      setDateKey((k) => k + 1);
    }
  }, [from, to]);
  const onDate = (which: 'from' | 'to') => (iso: string) => {
    emittedDates.current = { ...emittedDates.current, [which]: iso };
    setFilter({ [which]: iso || null });
  };

  // Staff names for the کارشناس column — one small cached list, shared with
  // LeadDetail's assignment select (same query key).
  const { data: staffData } = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => adminApi.staff() });
  const staffName = new Map((staffData?.staff ?? []).map((m) => [m.id, m.name ?? m.mobile] as const));

  // `to` is a date-only picker; sent as-is it'd mean "up to today's
  // midnight" and silently exclude every lead created today after 00:00.
  const toParam = to ? `${to}T23:59:59` : undefined;

  const assignee = onlyMine && currentUser ? currentUser.id : undefined;
  // Now that ?mine=1 arrives from a bookmark, the session may not be in the
  // store yet on first paint — and `assignee` silently falling back to
  // undefined would serve the whole company's pipeline under a «سرنخ‌های من»
  // URL. Wait instead of fetching the wrong thing.
  const awaitingSession = onlyMine && !currentUser && authStatus === 'loading';
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'leads', status, q, from, to, page, assignee ?? ''],
    enabled: !awaitingSession,
    queryFn: () =>
      adminApi.leads({
        status: status || undefined,
        assignee,
        q: q || undefined,
        from: from || undefined,
        to: toParam,
        page,
        perPage: PER_PAGE,
      }),
  });

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const exportCapped = total > LEADS_EXPORT_MAX_ROWS;

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      <div className={ui.toolbar}>
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={status === f.id} onClick={() => setFilter({ status: f.id || null })}>
            {f.label}
          </Chip>
        ))}
        {/* `|| onlyMine`: an active filter must always be visible — with the
            flag in the URL the chip would otherwise vanish on a bookmarked
            «سرنخ‌های من» link until the session lands, leaving a filtered list
            with no filter shown. */}
        {currentUser || onlyMine ? (
          <Chip selected={onlyMine} onClick={() => setFilter({ mine: onlyMine ? null : '1' })}>
            سرنخ‌های من
          </Chip>
        ) : null}
        <input
          className={ui.textCell}
          style={{ inlineSize: '14rem', marginInlineStart: 'auto' }}
          placeholder="جستجو: شماره، موبایل، نام…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="جستجوی سرنخ"
        />
      </div>
      <div className={ui.toolbar}>
        <span className={ui.muted}>از</span>
        <JalaliDateField key={`from-${dateKey}`} value={from} onChange={onDate('from')} label="از تاریخ (شمسی)" />
        <span className={ui.muted}>تا</span>
        <JalaliDateField key={`to-${dateKey}`} value={to} onChange={onDate('to')} label="تا تاریخ (شمسی)" />
        <Button
          size="sm"
          variant="ghost"
          disabled={total === 0}
          onClick={() => {
            // Content-Disposition: attachment on the response — the browser
            // downloads it instead of navigating away from the SPA.
            // `assignee` MUST go with the rest: the file has to be the list on
            // screen, and nothing inside the CSV says which filters made it.
            window.location.href = adminApi.leadsExportUrl({
              status: status || undefined,
              assignee,
              q: q || undefined,
              from: from || undefined,
              to: toParam,
            });
          }}
        >
          خروجی اکسل
        </Button>
        {data ? (
          <span className={ui.muted} style={exportCapped ? { color: 'var(--color-loss-text)' } : undefined}>
            {exportCapped
              ? `خروجی حداکثر ${faCount(LEADS_EXPORT_MAX_ROWS)} ردیف از ${faCount(total)} ردیف را می‌گیرد — بازهٔ تاریخ را کوچک‌تر کنید.`
              : `${faCount(total)} ردیف با همین فیلترها`}
          </span>
        ) : null}
      </div>

      {isLoading || awaitingSession ? (
        <TableSkeleton rows={6} cols={COLS} label="در حال بارگذاری سرنخ‌ها" />
      ) : isError ? (
        // Without this branch a failed fetch fell through to «سرنخی نیست» —
        // the rep read a broken request as an empty pipeline.
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری سرنخ‌ها ناموفق بود."
          body="ارتباط با سرور برقرار نشد. فهرست ممکن است ناقص باشد."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : leads.length === 0 ? (
        <EmptyState size="section" headline="سرنخی نیست" body="با این فیلتر سرنخی ثبت نشده است." />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست سرنخ‌ها</caption>
          <thead>
            <tr>
              <th scope="col">شماره</th>
              <th scope="col">مشتری</th>
              <th scope="col">وزن / ارزش</th>
              <th scope="col">منبع</th>
              <th scope="col">وضعیت</th>
              <th scope="col">کارشناس</th>
              <th scope="col">تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const meta = STATUS_META[l.status];
              return (
                <FragmentRow
                  key={l.id}
                  lead={l}
                  meta={meta}
                  assigneeName={l.assigneeId ? (staffName.get(l.assigneeId) ?? '—') : null}
                  open={openId === l.id}
                  onToggle={() => setOpenId(openId === l.id ? null : l.id)}
                />
              );
            })}
          </tbody>
        </table></div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(total)} سرنخ</p> : null}
      {data ? (
        <PagerFooter page={page} perPage={PER_PAGE} total={total} onPage={(p) => setParams({ page: p > 1 ? String(p) : null })} />
      ) : null}
    </div>
  );
}

function FragmentRow({
  lead,
  meta,
  assigneeName,
  open,
  onToggle,
}: {
  lead: AdminLead;
  meta: { label: string; tone: 'info' | 'action' | 'gain' | 'loss' };
  assigneeName: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const est = estimateOf(lead);
  return (
    <>
      <tr
        className={ui.rowClickable}
        onClick={onToggle}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="tnum">
          {/* Deep link to the lead's own page (share/bookmark-able); clicking
              elsewhere on the row still expands inline for quick triage. */}
          <Link
            href={`/admin/leads/${encodeURIComponent(lead.id)}`}
            style={{ color: 'var(--color-accent-text)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <bdi>{lead.ref}</bdi>
          </Link>
        </td>
        <td>
          {/* The customer is what the rep scans for, so the name gets label
              type on the strong ink and the mobile drops to a muted line
              under it — both used to be one run of identical body text. */}
          <Text as="div" variant="label" color="strong">
            {lead.contactName ?? 'بدون نام'}
            {lead.contactVerified ? (
              <>
                {' '}
                <Badge tone="gain">تأیید شده</Badge>
              </>
            ) : null}
          </Text>
          <Text as="div" variant="caption" color="muted" className="tnum">
            {toPersianDigits(lead.contactMobile)}
          </Text>
        </td>
        {/* Triage needs the size of the deal on the row: without it the rep had
            to open all 30 leads to find which one is worth calling first. Both
            numbers are the capture-time estimate — pre-VAT, and stale once the
            market moves — so they are never dressed up as a quote. */}
        <td className="tnum">
          {est.weightKg ? <div>{formatWeight(est.weightKg)}</div> : null}
          {est.price ? (
            <Text as="div" variant="caption" color="muted" className="tnum">
              <span title="برآورد لحظهٔ ثبت، پیش از مالیات — مبلغ قطعی روی پیش‌فاکتور است.">
                ≈ {formatTomanCompact(est.price)} تومان
              </span>
            </Text>
          ) : null}
          {!est.weightKg && !est.price ? <span className={ui.muted}>—</span> : null}
        </td>
        <td>{SOURCE_LABEL[lead.source] ?? lead.source}</td>
        <td>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </td>
        <td>
          {assigneeName ?? <span className={ui.muted}>—</span>}
          {lead.callbackAt ? (
            <div className={`${ui.muted} tnum`}>تماس: {formatJalali(lead.callbackAt)}</div>
          ) : null}
        </td>
        <td className="tnum">{formatJalali(lead.createdAt)}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={COLS}>
            <LeadDetail id={lead.id} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
