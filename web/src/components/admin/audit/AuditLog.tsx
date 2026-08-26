'use client';
/**
 * «گزارش فعالیت» — the read-only trail of every write in the panel, rendered
 * as a day-grouped timeline of sentences («فلانی مقاله را منتشر کرد») with a
 * field-level diff under each one.
 *
 * It replaced a table whose «جزئیات» column was a raw JSON dump of both
 * snapshots: technically complete, practically unreadable — on a settings row
 * that's dozens of unchanged lines hiding the one field that moved. Answering
 * "who broke the article yesterday" is the entire job here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import { JalaliDateField } from '../JalaliDateField';
import { ActivityItem, type AuditRow } from './ActivityItem';
import styles from './activity.module.css';
import ui from '../adminUi.module.css';

const ENTITY_FILTERS = [
  { id: '', label: 'همه' },
  { id: 'sku', label: 'کالا' },
  { id: 'lead', label: 'سرنخ' },
  { id: 'order', label: 'سفارش' },
  { id: 'article', label: 'مقاله' },
  { id: 'setting', label: 'تنظیمات' },
  { id: 'user', label: 'کاربر' },
  { id: 'admin_allowlist', label: 'دسترسی پنل' },
];

/** Jalali day key + a human heading («امروز» / «دیروز» / the date). */
function dayKey(iso: string): string {
  return formatJalali(iso, 'yyyy/MM/dd');
}
function dayHeading(iso: string, todayKey: string, yesterdayKey: string): string {
  const k = dayKey(iso);
  if (k === todayKey) return 'امروز';
  if (k === yesterdayKey) return 'دیروز';
  return formatJalali(iso, 'EEEE d MMMM yyyy');
}

export function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actionQ, setActionQ] = useState('');
  const [actorQ, setActorQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setActionQ(action.trim()), 300);
    return () => clearTimeout(t);
  }, [action]);
  useEffect(() => {
    const t = setTimeout(() => setActorQ(actor.trim()), 300);
    return () => clearTimeout(t);
  }, [actor]);

  // `to` is a date-only picker — sent as-is it means "up to today's
  // midnight" and silently drops every event from today after 00:00.
  const toParam = to ? `${to}T23:59:59` : undefined;

  // Keyset ("load more") instead of page numbers — the API is now
  // cursor-paginated (see auditRepo.listAudit): an ever-growing append-only
  // log has no cheap "page N of M" (that needs a total count(*), a full
  // table scan on every request), so there's no random page access anymore,
  // only "older" via nextCursor.
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin', 'audit', entityType, actionQ, actorQ, from, to],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      adminApi.audit({
        entityType: entityType || undefined,
        action: actionQ || undefined,
        actor: actorQ || undefined,
        from: from || undefined,
        to: toParam,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // useMemo, not a plain expression: `flatMap`/`?? []` return a NEW array
  // reference every render, which made the grouping useMemo below (keyed on
  // `entries`) recompute on every render regardless of whether the data
  // actually changed — it looked memoized but never was.
  const entries = useMemo(() => (data?.pages.flatMap((p) => p.entries) ?? []) as AuditRow[], [data]);

  // Group into Jalali days for the timeline headings. useMemo because the
  // grouping walks every loaded entry and "load more" keeps appending.
  const { groups, todayKey, yesterdayKey } = useMemo(() => {
    const now = new Date();
    const tKey = dayKey(now.toISOString());
    const yKey = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
    const map = new Map<string, AuditRow[]>();
    for (const e of entries) {
      const k = dayKey(e.at);
      const bucket = map.get(k);
      if (bucket) bucket.push(e);
      else map.set(k, [e]);
    }
    return { groups: Array.from(map.entries()), todayKey: tKey, yesterdayKey: yKey };
  }, [entries]);

  return (
    <div>
      <div className={ui.toolbar}>
        {ENTITY_FILTERS.map((f) => (
          <Chip key={f.id} selected={entityType === f.id} onClick={() => setEntityType(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div className={ui.toolbar}>
        <input
          className={`${ui.textCell} ${ui.mono}`}
          dir="ltr"
          placeholder="فیلتر عملیات (مثلاً content.publish)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="فیلتر عملیات"
        />
        <input
          className={ui.textCell}
          placeholder="فیلتر کاربر (نام یا موبایل)"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="فیلتر کاربر"
        />
        <JalaliDateField value={from} onChange={setFrom} label="از تاریخ (شمسی)" />
        <span className={ui.muted}>تا</span>
        <JalaliDateField value={to} onChange={setTo} label="تا تاریخ (شمسی)" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            window.location.href = adminApi.auditExportUrl({
              entityType: entityType || undefined,
              action: actionQ || undefined,
              actor: actorQ || undefined,
              from: from || undefined,
              to: toParam,
            });
          }}
        >
          خروجی اکسل
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={2} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری رویدادها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          size="section"
          headline="رویدادی نیست"
          body="هر تغییری که کارشناسان در پنل انجام دهند اینجا ثبت می‌شود."
        />
      ) : (
        groups.map(([key, rows]) => (
          <section key={key} className={styles.dayGroup}>
            <h2 className={styles.dayHead}>
              {dayHeading(rows[0]!.at, todayKey, yesterdayKey)}
              <span className={styles.dayCount}>{toPersianDigits(rows.length)} رویداد</span>
            </h2>
            <ul className={styles.list}>
              {rows.map((e) => (
                <ActivityItem key={e.id} row={e} />
              ))}
            </ul>
          </section>
        ))
      )}

      {hasNextPage && (
        <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Button size="sm" variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? 'در حال بارگذاری…' : 'نمایش موارد قدیمی‌تر'}
          </Button>
        </div>
      )}
    </div>
  );
}
