'use client';
/** Lead list — status filter + search; a row expands into the detail panel. */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type AdminLead } from '@/lib/api/resources/admin';
import { formatJalali, toPersianDigits } from '@/lib/utils/format';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import { LeadDetail } from './LeadDetail';
import { PagerFooter } from '../PagerFooter';
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
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // A new filter always jumps back to page 1 — otherwise "صفحهٔ ۵" of the old
  // (much longer) result set can be past the end of the new, filtered one.
  useEffect(() => {
    setPage(1);
  }, [status, q, from, to]);

  // `to` is a date-only picker; sent as-is it'd mean "up to today's
  // midnight" and silently exclude every lead created today after 00:00.
  const toParam = to ? `${to}T23:59:59` : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'leads', status, q, from, to, page],
    queryFn: () =>
      adminApi.leads({ status: status || undefined, q: q || undefined, from: from || undefined, to: toParam, page, perPage: PER_PAGE }),
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
        <input
          type="date"
          className={ui.textCell}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="از تاریخ"
        />
        <span className={ui.muted}>تا</span>
        <input
          type="date"
          className={ui.textCell}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="تا تاریخ"
        />
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
        <table className={ui.table}>
          <caption className="visually-hidden">فهرست سرنخ‌ها</caption>
          <thead>
            <tr>
              <th scope="col">شماره</th>
              <th scope="col">مشتری</th>
              <th scope="col">منبع</th>
              <th scope="col">وضعیت</th>
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
                  open={openId === l.id}
                  onToggle={() => setOpenId(openId === l.id ? null : l.id)}
                />
              );
            })}
          </tbody>
        </table>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} سرنخ</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}

function FragmentRow({
  lead,
  meta,
  open,
  onToggle,
}: {
  lead: AdminLead;
  meta: { label: string; tone: 'info' | 'action' | 'gain' | 'loss' };
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
          <bdi>{lead.ref}</bdi>
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
        <td className="tnum">{formatJalali(lead.createdAt)}</td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5}>
            <LeadDetail id={lead.id} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
