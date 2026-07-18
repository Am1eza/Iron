'use client';
/** Consignment warehouse — all customers' stock + receive new items +
 *  per-customer settlement report (US-08.5). */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { WAREHOUSE_STATUS_LABEL, type WarehouseStatus, type WarehouseItem } from '@/lib/types/domain';
import { formatJalali, formatToman, normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, EmptyState, Heading, Spinner, TableSkeleton, Tabs, TabPanel, Text } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

const STATUSES = Object.entries(WAREHOUSE_STATUS_LABEL) as [WarehouseStatus, string][];

type AdminWarehouseItem = WarehouseItem & { userId: string; customerMobile: string; customerName: string | null };

function ItemEditFields({ item }: { item: AdminWarehouseItem }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(item.quantityTons));
  const [fee, setFee] = useState(String(item.monthlyFeeToman));
  const dirty = normalizeDigits(qty) !== String(item.quantityTons) || normalizeDigits(fee) !== String(item.monthlyFeeToman);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateWarehouseItem(item.id, {
        quantityTons: Number(normalizeDigits(qty)),
        monthlyFeeToman: Number(normalizeDigits(fee)),
      }),
    onSuccess: () => {
      toast.success('مقدار/هزینه به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  return (
    <span style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
      <input
        className={ui.numInput}
        style={{ inlineSize: '6rem' }}
        inputMode="decimal"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        aria-label={`مقدار ${item.ref} (تن)`}
      />
      <input
        className={ui.numInput}
        inputMode="numeric"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        aria-label={`هزینهٔ ماهانهٔ ${item.ref}`}
      />
      {dirty ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate()} loading={save.isPending}>
          ذخیره
        </Button>
      ) : null}
    </span>
  );
}

export function WarehouseManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('items');
  const [form, setForm] = useState({ mobile: '', product: '', sizeLabel: '', quantityTons: '', monthlyFeeToman: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'warehouse'],
    queryFn: () => adminApi.warehouse(),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WarehouseStatus }) =>
      adminApi.updateWarehouseItem(id, { status }),
    onSuccess: () => {
      toast.success('وضعیت کالا به‌روزرسانی شد.');
      invalidate();
    },
    // The <select> below offers every status (including ones "behind" the
    // current one) — surface the server's specific message (e.g. the
    // backward-transition guard) instead of a generic failure, and
    // invalidate so the <select> snaps back to the real (unchanged) status.
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.');
      invalidate();
    },
  });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createWarehouseItem({
        mobile: normalizeDigits(form.mobile.trim()),
        product: form.product.trim(),
        sizeLabel: form.sizeLabel.trim() || undefined,
        quantityTons: Number(normalizeDigits(form.quantityTons)),
        monthlyFeeToman: form.monthlyFeeToman ? Number(normalizeDigits(form.monthlyFeeToman)) : undefined,
      }),
    onSuccess: (res) => {
      toast.success(`کالا با شمارهٔ ${res.item.ref} ثبت شد.`);
      setForm({ mobile: '', product: '', sizeLabel: '', quantityTons: '', monthlyFeeToman: '' });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت کالا ناموفق بود.'),
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const canCreate =
    /^09\d{9}$/.test(normalizeDigits(form.mobile.trim())) &&
    form.product.trim().length > 0 &&
    Number(normalizeDigits(form.quantityTons)) > 0;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <Tabs
        label="بخش‌های انبار"
        idBase="warehouse"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'items', label: 'کالاها' },
          { id: 'settlement', label: 'تسویه‌حساب' },
        ]}
      />

      <TabPanel id="items" active={tab} idBase="warehouse">
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : isError ? (
            <EmptyState
              size="section"
              tone="error"
              headline="بارگذاری انبار ناموفق بود."
              primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
            />
          ) : items.length === 0 ? (
            <EmptyState size="section" headline="انبار خالی است" body="کالای امانی مشتریان اینجا ثبت می‌شود." />
          ) : (
            <table className={ui.table}>
              <caption className="visually-hidden">فهرست کالاهای امانی انبار مشتریان</caption>
              <thead>
                <tr>
                  <th scope="col">کد</th>
                  <th scope="col">مشتری</th>
                  <th scope="col">محصول</th>
                  <th scope="col">مقدار (تن) / هزینهٔ ماهانه</th>
                  <th scope="col">تاریخ ثبت</th>
                  <th scope="col">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="tnum">
                      <bdi>{it.ref}</bdi>
                    </td>
                    <td className={`tnum ${ui.mono}`}>
                      {it.customerName ?? '—'}
                      <div className={ui.muted}>{it.customerMobile}</div>
                    </td>
                    <td>
                      {it.product}
                      {it.sizeLabel ? <span className={ui.muted}> · {it.sizeLabel}</span> : null}
                    </td>
                    <td>
                      <ItemEditFields item={it} />
                    </td>
                    <td className="tnum">{formatJalali(it.storedAt)}</td>
                    <td>
                      <select
                        className={ui.select}
                        value={it.status}
                        onChange={(e) => update.mutate({ id: it.id, status: e.target.value as WarehouseStatus })}
                        aria-label={`وضعیت ${it.ref}`}
                      >
                        {STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <Card>
            <Heading level={2}>ثبت کالای جدید</Heading>
            <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
              <TextInput
                label="موبایل مشتری"
                inputMode="numeric"
                dir="ltr"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                helper="مشتری باید در سایت ثبت‌نام کرده باشد."
              />
              <TextInput label="محصول" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
              <TextInput label="سایز (اختیاری)" value={form.sizeLabel} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })} />
              <TextInput
                label="مقدار (تن)"
                inputMode="decimal"
                value={form.quantityTons}
                onChange={(e) => setForm({ ...form, quantityTons: e.target.value })}
              />
              <TextInput
                label="هزینهٔ ماهانه (تومان، اختیاری)"
                inputMode="numeric"
                value={form.monthlyFeeToman}
                onChange={(e) => setForm({ ...form, monthlyFeeToman: e.target.value })}
              />
            </div>
            <Button
              style={{ marginBlockStart: 'var(--space-3)' }}
              onClick={() => create.mutate()}
              disabled={!canCreate}
              loading={create.isPending}
            >
              ثبت کالا
            </Button>
          </Card>
        </div>
      </TabPanel>

      <TabPanel id="settlement" active={tab} idBase="warehouse">
        <SettlementPanel items={items} />
      </TabPanel>
    </div>
  );
}

/** Per-customer settlement (US-08.5) — backed by the real
 *  warehouseSettlements ledger: each "ثبت تسویه" freezes a period + the
 *  item's qty/fee snapshot as a permanent billing record, computed pro-rata
 *  since the last settlement (or since storedAt if never settled). */
function SettlementPanel({ items }: { items: AdminWarehouseItem[] }) {
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'warehouse', 'settlement-customers'],
    queryFn: () => adminApi.settlementCustomers(),
  });
  const customers = data?.customers ?? [];

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری تسویه‌حساب ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : customers.length === 0 ? (
        <EmptyState size="section" headline="کالای فعالی نیست" body="پس از ثبت کالای امانی، تسویه‌حساب هر مشتری اینجا جمع می‌شود." />
      ) : (
        <table className={ui.table}>
          <caption className="visually-hidden">گزارش تسویه‌حساب هزینهٔ انبار به تفکیک مشتری</caption>
          <thead>
            <tr>
              <th scope="col">مشتری</th>
              <th scope="col">تعداد کالای فعال</th>
              <th scope="col">تسویه‌نشدهٔ فعلی</th>
              <th scope="col">
                <span className="visually-hidden">عملیات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.userId}>
                <td className={`tnum ${ui.mono}`}>
                  {c.name ?? '—'}
                  <div className={ui.muted}>{c.mobile}</div>
                </td>
                <td className="tnum">{toPersianDigits(c.activeItemCount)}</td>
                <td className="tnum">{formatToman(c.totalUnsettledToman, false)} تومان</td>
                <td>
                  <Button size="sm" variant="ghost" onClick={() => setOpenCustomer(openCustomer === c.userId ? null : c.userId)}>
                    {openCustomer === c.userId ? 'بستن' : 'جزئیات'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {openCustomer ? <CustomerSettlementDetail userId={openCustomer} items={items} /> : null}
    </div>
  );
}

function CustomerSettlementDetail({ userId, items }: { userId: string; items: AdminWarehouseItem[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'warehouse', 'settlement', userId],
    queryFn: () => adminApi.settlementsForCustomer(userId),
  });
  const settle = useMutation({
    mutationFn: (warehouseItemId: string) => adminApi.createSettlement(warehouseItemId),
    onSuccess: () => {
      toast.success('تسویه ثبت شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'warehouse', 'settlement'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'warehouse', 'settlement-customers'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت تسویه ناموفق بود.'),
  });

  const productLabel = (warehouseItemId: string) => items.find((i) => i.id === warehouseItemId)?.product ?? warehouseItemId;

  if (isLoading || !data) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  return (
    <Card>
      <Heading level={2}>
        تسویه‌حساب {data.user.name ?? data.user.mobile} <span className={`${ui.muted} tnum`}>{data.user.mobile}</span>
      </Heading>

      <div style={{ marginBlockStart: 'var(--space-2)' }}>
        <Text color="muted">مبلغ تسویه‌نشدهٔ هر قلم (از آخرین تسویه یا تاریخ ثبت تا الان)</Text>
      </div>
      {data.unsettled.length === 0 ? (
        <p className={ui.muted}>قلم فعالی نیست.</p>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--space-2)', marginBlockStart: 'var(--space-2)' }}>
          {data.unsettled.map((u) => (
            <li key={u.warehouseItemId} className="tnum" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span style={{ flex: '1 1 auto' }}>
                {productLabel(u.warehouseItemId)} · {toPersianDigits(Math.round(u.days))} روز
              </span>
              <span>{formatToman(u.amountToman, false)} تومان</span>
              <Button
                size="sm"
                variant="secondary"
                loading={settle.isPending}
                disabled={u.amountToman <= 0}
                onClick={() => settle.mutate(u.warehouseItemId)}
              >
                ثبت تسویه
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginBlockStart: 'var(--space-4)' }}>
        <Text color="muted">تاریخچهٔ تسویه‌ها</Text>
      </div>
      {data.history.length === 0 ? (
        <p className={ui.muted}>هنوز تسویه‌ای ثبت نشده.</p>
      ) : (
        <ul style={{ marginBlockStart: 'var(--space-2)' }}>
          {data.history.map((h) => (
            <li key={h.id} className="tnum">
              {productLabel(h.warehouseItemId)} · {formatJalali(h.periodFrom)} تا {formatJalali(h.periodTo)} —{' '}
              {formatToman(h.amountToman, false)} تومان
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
