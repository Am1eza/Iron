'use client';
/** Admin price-alerts (قیمت‌سنج) management — US-24.5, rebuilt W22 after an
 *  audit found the page unusable for support triage: no search, no way to
 *  tell "close to firing" from "stale feed, will never fire", a single
 *  ambiguous cap number post-per-tier-caps, hand-rolled pagination with no
 *  real total, and no reactivate path for a 'triggered' alert a customer
 *  calls in about. */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, TableSkeleton } from '@/components/ui';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const STATUS_TABS: Array<{ id: '' | 'active' | 'triggered' | 'paused'; label: string }> = [
  { id: '', label: 'همه' },
  { id: 'active', label: 'فعال' },
  { id: 'triggered', label: 'اجراشده' },
  { id: 'paused', label: 'متوقف' },
];

const CHANNEL_LABEL: Record<string, string> = { sms: 'پیامک', telegram: 'تلگرام', whatsapp: 'واتساپ', eitaa: 'ایتا' };

const PER_PAGE = 50;

export function AlertsPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | 'active' | 'triggered' | 'paused'>('active');
  const [page, setPage] = useState(1);

  // Same 300ms local debounce as WarehouseManager/OrdersManager's search
  // boxes — a rep typing a mobile number shouldn't fire a request per digit.
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, q]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'alerts', status, page, q],
    queryFn: () => adminApi.alerts({ status: status || undefined, q: q || undefined, page }),
  });

  // Total ACTIVE count for the summary tile, independent of whatever status
  // tab is currently selected — the key lines up with the main query above
  // so when the operator is already on the "فعال" tab with no search this
  // rides the same cache entry instead of firing a second request.
  const { data: activeStat } = useQuery({
    queryKey: ['admin', 'alerts', 'active', 1, ''],
    queryFn: () => adminApi.alerts({ status: 'active', page: 1 }),
    staleTime: 15_000,
  });

  // Same ['admin','stats'] query the nav sidebar polls every 20s (W22 added
  // `triggeredAlerts` to it for the nav badge) — reused here for the
  // "اجراشده، بررسی‌نشده" tile so this page doesn't add its own poll.
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.stats(),
    refetchInterval: 20_000,
  });

  const setAlertStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'active' | 'paused' }) => adminApi.updateAlertStatus(id, next),
    onSuccess: () => {
      toast.success('وضعیت هشدار به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    // 409 {error:'limit', message, cap} when reactivating would push the
    // customer over their tier cap — same shape as every other mutation
    // error here, the server-provided Persian message is already user-ready.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  const rows = data?.alerts ?? [];
  const caps = data?.caps;
  const activeCount = activeStat?.total ?? 0;
  const triggeredCount = statsData?.stats?.triggeredAlerts ?? 0;

  return (
    <div>
      <div className={ui.tiles} style={{ marginBlockEnd: 'var(--space-4)' }}>
        <div className={ui.tile}>
          <div className={`${ui.tileValue} tnum`}>{toPersianDigits(activeCount)}</div>
          <div className={ui.tileLabel}>هشدار فعال</div>
        </div>
        <div className={`${ui.tile} ${triggeredCount > 0 ? ui.tileBad : ''}`}>
          <div className={`${ui.tileValue} tnum`}>{toPersianDigits(triggeredCount)}</div>
          <div className={ui.tileLabel}>اجراشده، بررسی‌نشده</div>
        </div>
      </div>

      <div className={ui.toolbar}>
        {STATUS_TABS.map((t) => (
          <Chip key={t.id || 'all'} selected={status === t.id} onClick={() => setStatus(t.id)}>
            {t.label}
          </Chip>
        ))}
        <input
          className={ui.textCell}
          style={{ inlineSize: '18rem', marginInlineStart: 'auto' }}
          placeholder="جستجو: نام یا موبایل مشتری، محصول یا شاخص…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="جستجوی هشدار"
        />
      </div>
      {caps ? (
        <p className={ui.muted}>
          سقف هشدار فعال — عادی: {toPersianDigits(caps.base)} ·{' '}
          {/* W22 review fix: iron is independently configurable in Settings
             (SettingsForm.tsx) even though it defaults equal to base — show
             it separately whenever an admin has actually diverged the two,
             instead of a combined "عادی/آهنی" label that would then be
             silently wrong for iron-tier customers. */}
          آهنی: {caps.iron === caps.base ? 'همان عادی' : toPersianDigits(caps.iron)} · فولادی:{' '}
          {toPersianDigits(caps.steel)} · پولادی: {toPersianDigits(caps.poolad)}
        </p>
      ) : null}

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری هشدارها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="section"
          headline="هشداری نیست"
          body={q ? 'با این جستجو هشداری یافت نشد.' : 'در این وضعیت هیچ هشدار قیمتی ثبت نشده است.'}
        />
      ) : (
        <div className={ui.tableWrap}><table className={ui.table}>
          <caption className="visually-hidden">فهرست هشدارهای قیمت کاربران</caption>
          <thead>
            <tr>
              <th scope="col">مشتری</th>
              <th scope="col">هدف</th>
              <th scope="col">شرط و وضعیت قیمت</th>
              <th scope="col">کانال</th>
              <th scope="col">وضعیت</th>
              <th scope="col">تاریخ</th>
              <th scope="col">
                <span className="visually-hidden">عملیات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const acting = setAlertStatus.isPending && setAlertStatus.variables?.id === a.id;
              return (
                <tr key={a.id}>
                  <td>
                    {a.name ?? '—'}
                    {a.mobile ? (
                      <>
                        {' '}
                        <a href={`tel:${a.mobile}`} className="tnum" dir="ltr">
                          {toPersianDigits(a.mobile)}
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td>{a.target.label ? a.target.label : <Badge tone="neutral">کالا/شاخص یافت نشد</Badge>}</td>
                  <td className="tnum">
                    <div>
                      {a.op === 'below' ? 'کمتر از' : 'بیشتر از'} {formatToman(a.threshold, false)} تومان
                    </div>
                    <div className={ui.muted}>
                      الان: {a.currentValue != null ? `${formatToman(a.currentValue, false)} تومان` : '—'}
                    </div>
                    {a.isStale ? <Badge tone="stale">قیمت به‌روز نیست — هشدار فعال نمی‌شود</Badge> : null}
                  </td>
                  <td>{CHANNEL_LABEL[a.channel] ?? a.channel}</td>
                  <td>
                    {a.status === 'active' ? (
                      <Badge tone="gain">فعال</Badge>
                    ) : a.status === 'triggered' ? (
                      <Badge tone="accent">اجراشده</Badge>
                    ) : (
                      <Badge tone="stale">متوقف</Badge>
                    )}
                  </td>
                  <td className="tnum">{a.lastTriggeredAt ? formatJalali(a.lastTriggeredAt) : formatJalali(a.createdAt)}</td>
                  <td>
                    {a.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAlertStatus.mutate({ id: a.id, next: 'paused' })}
                        loading={acting}
                        disabled={setAlertStatus.isPending}
                      >
                        متوقف کن
                      </Button>
                    ) : a.status === 'paused' || a.status === 'triggered' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAlertStatus.mutate({ id: a.id, next: 'active' })}
                        loading={acting}
                        disabled={setAlertStatus.isPending}
                      >
                        فعال‌سازی مجدد
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} هشدار</p> : null}
      {data ? <PagerFooter page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
