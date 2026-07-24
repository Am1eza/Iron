'use client';
/** Lead list — status filter + search; a row expands into the detail panel. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type AdminLead } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/stores/auth';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import { LeadDetail } from './LeadDetail';
import { PagerFooter } from '../PagerFooter';
import { JalaliDateField } from '../JalaliDateField';
import ui from '../adminUi.module.css';

const PER_PAGE = 30;

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

export function LeadsTab() {
  // ?q= deep-link support — «میز کار من» links a rep's queue rows straight
  // here pre-searched by the lead ref.
  const initialQ = useSearchParams().get('q') ?? '';
  const [status, setStatus] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const currentUser = useAuthStore((st) => st.user);

  // Staff names for the کارشناس column — one small cached list, shared with
  // LeadDetail's assignment select (same query key).
  const { data: staffData } = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => adminApi.staff() });
  const staffName = new Map((staffData?.staff ?? []).map((m) => [m.id, m.name ?? m.mobile] as const));

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter always jumps back to page 1 — otherwise "صفحهٔ ۵" of the old
  // (much longer) result set can be past the end of the new, filtered one.
  useEffect(() => {
    setPage(1);
  }, [status, q, from, to, onlyMine]);

  // `to` is a date-only picker; sent as-is it'd mean "up to today's
  // midnight" and silently exclude every lead created today after 00:00.
  const toParam = to ? `${to}T23:59:59` : undefined;

  const assignee = onlyMine && currentUser ? currentUser.id : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'leads', status, q, from, to, page, assignee ?? ''],
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

  return (
    <div style={{ paddingBlockStart: 'var(--space-4)' }}>
      <div className={ui.toolbar}>
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={status === f.id} onClick={() => setStatus(f.id)}>
            {f.label}
          </Chip>
        ))}
        {currentUser ? (
          <Chip selected={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
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
        <JalaliDateField value={from} onChange={setFrom} label="از تاریخ (شمسی)" />
        <span className={ui.muted}>تا</span>
        <JalaliDateField value={to} onChange={setTo} label="تا تاریخ (شمسی)" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            // Content-Disposition: attachment on the response — the browser
            // downloads it instead of navigating away from the SPA.
            window.location.href = adminApi.leadsExportUrl({
              status: status || undefined,
              q: q || undefined,
              from: from || undefined,
              to: toParam,
            });
          }}
        >
          خروجی اکسل
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : leads.length === 0 ? (
        <EmptyState size="section" headline="سرنخی نیست" body="با این فیلتر سرنخی ثبت نشده است." />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست سرنخ‌ها</caption>
          <thead>
            <tr>
              <th scope="col">شماره</th>
              <th scope="col">مشتری</th>
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
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} سرنخ</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
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
          {lead.contactName ?? '—'}{' '}
          <span className={`${ui.muted} tnum`}>{toPersianDigits(lead.contactMobile)}</span>{' '}
          {lead.contactVerified ? <Badge tone="gain">تأیید شده</Badge> : null}
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
          <td colSpan={6}>
            <LeadDetail id={lead.id} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
