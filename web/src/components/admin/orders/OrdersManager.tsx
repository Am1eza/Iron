'use client';
/** Orders — advance each shipment along SHIPMENT_STEPS, set carrier tracking
 *  info, or cancel/archive (US-08.4). Persists via the API. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { SHIPMENT_STEPS } from '@/lib/types/domain';
import type { Order } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';
import { can, canActOnAssignedRecord } from '@/lib/auth/roles';
import { Alert, Badge, Button, Card, Chip, EmptyState, TableSkeleton, useConfirm } from '@/components/ui';
import { OrderTimeline } from '@/components/account/OrderTimeline';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';
import s from './OrdersManager.module.css';

type AdminOrder = Order & {
  leadId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  leadAssigneeId: string | null;
};

/** Server zod cap on both columns (route.ts `.max(100)`) — enforced here too
 *  so a rep hits the wall while typing, not after a failed save. */
const SHIPPING_FIELD_MAX = 100;

function ShippingFields({
  order,
  disabled,
  onSmsResult,
}: {
  order: AdminOrder;
  disabled: boolean;
  onSmsResult: (smsSent: boolean | undefined, ref: string) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [carrier, setCarrier] = useState(order.carrierName ?? '');
  const dirty = !disabled && (tracking !== (order.trackingNumber ?? '') || carrier !== (order.carrierName ?? ''));

  const save = useMutation({
    mutationFn: () => adminApi.updateOrderShipping(order.ref, { trackingNumber: tracking, carrierName: carrier }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      onSmsResult(res.smsSent, order.ref);
      if (res.smsSent === false) toast.error('اطلاعات حمل ذخیره شد، اما پیامک به‌روزرسانی به مشتری نرسید.');
      else toast.success('اطلاعات حمل ذخیره شد.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.'),
  });

  return (
    <div className={ui.toolbar}>
      <input
        className={ui.textCell}
        placeholder="نام حمل‌کننده"
        value={carrier}
        maxLength={SHIPPING_FIELD_MAX}
        disabled={disabled}
        onChange={(e) => setCarrier(e.target.value)}
        aria-label={`حمل‌کنندهٔ سفارش ${order.ref}`}
      />
      <input
        className={`${ui.textCell} ${ui.mono}`}
        dir="ltr"
        placeholder="شمارهٔ رهگیری"
        value={tracking}
        maxLength={SHIPPING_FIELD_MAX}
        disabled={disabled}
        onChange={(e) => setTracking(e.target.value)}
        aria-label={`شمارهٔ رهگیری سفارش ${order.ref}`}
      />
      {dirty ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate()} loading={save.isPending}>
          ذخیرهٔ حمل
        </Button>
      ) : null}
    </div>
  );
}

export function OrdersManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const currentUser = useAuthStore((st) => st.user);
  const [status, setStatus] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [page, setPage] = useState(1);

  // Local-only debounce (this page has no shareable/bookmarked filter state
  // the way LeadsTab's URL-synced search does) — same 300ms window though, so
  // a rep typing a ref/mobile doesn't fire a request per keystroke.
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, cancelled, q]);

  // Survives a dismiss the way LeadDetail's does: `seq` re-keys the <Alert>
  // so a SECOND sms failure (on a different order, or the same one again)
  // repaints a fresh dismissible banner instead of staying invisible because
  // the first one was already closed.
  const [smsAlert, setSmsAlert] = useState<{ seq: number; text: string } | null>(null);
  const warnSmsFailed = (text: string) => setSmsAlert((prev) => ({ seq: (prev?.seq ?? 0) + 1, text }));
  const onShippingSmsResult = (smsSent: boolean | undefined, ref: string) => {
    if (smsSent === false) {
      warnSmsFailed(`اطلاعات حمل سفارش ${ref} ذخیره شد، اما پیامک به‌روزرسانی به مشتری نرسید. کد رهگیری را تلفنی اعلام کنید.`);
    } else if (smsSent === true) {
      setSmsAlert(null);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    // Server pages at 50/page — order #51 was previously unreachable.
    queryKey: ['admin', 'orders', status, cancelled, q, page],
    queryFn: () => adminApi.orders({ status: status || undefined, cancelled, q: q || undefined, page }),
  });

  const advance = useMutation({
    mutationFn: ({ ref, next }: { ref: string; next: string }) => adminApi.updateOrderStatus(ref, next),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (res.smsSent === false) {
        toast.error(`وضعیت ${res.order.ref} به‌روزرسانی شد، اما پیامک به مشتری نرسید.`);
        warnSmsFailed(`وضعیت سفارش ${res.order.ref} تغییر کرد، اما پیامک اطلاع‌رسانی به مشتری نرسید. مشتری را تلفنی مطلع کنید.`);
      } else {
        toast.success(`وضعیت ${res.order.ref} به‌روزرسانی شد.`);
        if (res.smsSent) setSmsAlert(null);
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی وضعیت ناموفق بود.'),
  });

  const cancel = useMutation({
    mutationFn: (ref: string) => adminApi.cancelOrder(ref),
    onSuccess: (res, ref) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      if (res.smsSent === false) {
        toast.error(`سفارش ${ref} لغو شد، اما پیامک به مشتری نرسید.`);
        warnSmsFailed(`سفارش ${ref} لغو شد، اما پیامک اطلاع لغو به مشتری نرسید. موضوع را تلفنی اعلام کنید.`);
      } else {
        toast.success('سفارش لغو شد.');
        if (res.smsSent) setSmsAlert(null);
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'لغو سفارش ناموفق بود.'),
  });

  const askAdvance = (order: AdminOrder, next: { key: string; label: string }) => {
    // Irreversible (the API 409s a backward move) AND it SMSes the customer —
    // both facts belong in the confirm body, not just the button label.
    void confirm({
      title: `پیشروی به «${next.label}»؟`,
      body: `وضعیت سفارش ${order.ref} به «${next.label}» تغییر می‌کند و همان لحظه پیامک اطلاع‌رسانی برای مشتری ارسال می‌شود. این تغییر قابل بازگشت نیست.`,
      confirmLabel: 'تغییر و اطلاع به مشتری',
    }).then((ok) => {
      if (ok) advance.mutate({ ref: order.ref, next: next.key });
    });
  };

  const askCancel = (ref: string) => {
    void confirm({
      title: 'لغو سفارش',
      body: `سفارش ${ref} لغو/آرشیو می‌شود؛ رکورد آن حذف نمی‌شود و ممکن است پیامکی به مشتری ارسال شود. ادامه؟`,
      confirmLabel: 'لغو کن',
    }).then((ok) => {
      if (ok) cancel.mutate(ref);
    });
  };

  const orders = data?.orders ?? [];

  // A leads:manage holder may cancel ANY order (that's the return flow — a
  // delivered order can be cancelled on purpose, see engagement.test.ts), but
  // per-order advance/shipping is gated on the source lead's assignee so a
  // rep never sees a control the API would 403. Fails closed while the
  // session is still hydrating, same as LeadDetail's canClaim/canRelease.
  const canManageOrders = can(currentUser?.role, 'leads:manage');
  const ownsOrder = (leadAssigneeId: string | null) =>
    currentUser !== null && canActOnAssignedRecord({ id: currentUser.id, role: currentUser.role }, leadAssigneeId);

  return (
    <div>
      <div className={ui.toolbar}>
        <Chip
          selected={!cancelled && status === ''}
          onClick={() => {
            setCancelled(false);
            setStatus('');
          }}
        >
          همه
        </Chip>
        {SHIPMENT_STEPS.map((st) => (
          <Chip
            key={st.key}
            selected={!cancelled && status === st.key}
            onClick={() => {
              setCancelled(false);
              setStatus(st.key);
            }}
          >
            {st.label}
          </Chip>
        ))}
        <Chip
          selected={cancelled}
          onClick={() => {
            setCancelled(true);
            setStatus('');
          }}
        >
          لغوشده
        </Chip>
        <input
          className={ui.textCell}
          style={{ inlineSize: '14rem', marginInlineStart: 'auto' }}
          placeholder="جستجو: شماره سفارش، نام یا موبایل مشتری…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="جستجوی سفارش"
        />
      </div>

      {smsAlert ? (
        <Alert key={smsAlert.seq} tone="warning" title="پیامک به مشتری ارسال نشد" dismissible>
          {smsAlert.text}
        </Alert>
      ) : null}

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری سفارش‌ها ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          size="section"
          headline={cancelled ? 'سفارش لغوشده‌ای نیست' : q ? 'با این جستجو سفارشی نیست' : 'سفارشی نیست'}
          body="سفارش‌ها از سرنخ‌های موفق ساخته می‌شوند (CRM ← تبدیل به سفارش)."
        />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {orders.map((o) => {
            const idx = SHIPMENT_STEPS.findIndex((st) => st.key === o.status);
            const next = SHIPMENT_STEPS[idx + 1];
            const canAct = ownsOrder(o.leadAssigneeId);
            const advancing = advance.isPending && advance.variables?.ref === o.ref;
            const cancelling = cancel.isPending && cancel.variables === o.ref;
            return (
              <Card key={o.ref} className={o.cancelled ? s.cardCancelled : undefined}>
                <div className={ui.toolbar}>
                  <strong className="tnum">
                    <bdi>{o.ref}</bdi>
                  </strong>
                  <Badge tone={o.cancelled ? 'stale' : o.status === 'delivered' ? 'gain' : 'info'}>
                    {SHIPMENT_STEPS[idx]?.label ?? o.status}
                  </Badge>
                  {o.cancelled ? <Badge tone="loss">لغوشده</Badge> : null}
                  {/* Whose order is this? Name + tap-to-call + the source lead
                      — previously absent, forcing a manual CRM cross-reference. */}
                  {o.customerName || o.customerMobile ? (
                    <span className={ui.muted}>
                      {o.customerName ?? ''}
                      {o.customerMobile ? (
                        <>
                          {' '}
                          <a href={`tel:${o.customerMobile}`} className="tnum" dir="ltr">
                            {toPersianDigits(o.customerMobile)}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {o.leadId ? (
                    <Link href={`/admin/leads/${encodeURIComponent(o.leadId)}`}>سرنخ مبدأ</Link>
                  ) : null}
                  <span className={`${ui.muted} tnum`}>ثبت: {formatJalali(o.placedAt)}</span>
                  <span className={`${ui.muted} tnum`}>آخرین تغییر: {formatJalali(o.lastUpdate)}</span>
                  <div className={ui.rowActions} style={{ marginInlineStart: 'auto' }}>
                    {!o.cancelled && next && canAct ? (
                      <Button
                        size="sm"
                        onClick={() => askAdvance(o, next)}
                        loading={advancing}
                        disabled={advancing || cancelling}
                      >
                        مرحلهٔ بعد: {next.label}
                      </Button>
                    ) : null}
                    {!o.cancelled && canManageOrders ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => askCancel(o.ref)}
                        loading={cancelling}
                        disabled={advancing || cancelling}
                      >
                        لغو سفارش
                      </Button>
                    ) : null}
                  </div>
                </div>
                {!o.cancelled && next && !canAct ? (
                  <p className={s.hint}>
                    این سفارش به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند وضعیت یا اطلاعات حمل را تغییر دهد.
                  </p>
                ) : null}
                {/* Reuses the customer-facing timeline: same accessible name
                    (`aria-label`), same muted/frozen treatment for a
                    cancelled shipment — a rep and a customer should never
                    read two different stories about the same order. */}
                <OrderTimeline status={o.status} cancelled={Boolean(o.cancelled)} />
                {!o.cancelled ? (
                  <ShippingFields order={o} disabled={!canAct} onSmsResult={onShippingSmsResult} />
                ) : null}
                <p className={ui.muted}>
                  {o.items.map((it) => `${it.name} × ${toPersianDigits(it.qty)}`).join(' · ') || 'بدون قلم'}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {data ? <p className={ui.muted}>{toPersianDigits(data.total)} سفارش</p> : null}
      {data ? <PagerFooter page={page} perPage={50} total={data.total} onPage={setPage} /> : null}
      {dialog}
    </div>
  );
}
