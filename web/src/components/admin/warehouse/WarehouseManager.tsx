'use client';
/** Consignment warehouse — all customers' stock + receive new items. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { WAREHOUSE_STATUS_LABEL, type WarehouseStatus } from '@/lib/types/domain';
import { formatJalali, formatToman, normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Button, Card, EmptyState, Heading, TableSkeleton } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import ui from '../adminUi.module.css';

const STATUSES = Object.entries(WAREHOUSE_STATUS_LABEL) as [WarehouseStatus, string][];

export function WarehouseManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ mobile: '', product: '', sizeLabel: '', quantityTons: '', monthlyFeeToman: '' });

  const { data, isLoading } = useQuery({
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
    onError: () => toast.error('به‌روزرسانی ناموفق بود.'),
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

  const items = data?.items ?? [];
  const canCreate =
    /^09\d{9}$/.test(normalizeDigits(form.mobile.trim())) &&
    form.product.trim().length > 0 &&
    Number(normalizeDigits(form.quantityTons)) > 0;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : items.length === 0 ? (
        <EmptyState size="section" headline="انبار خالی است" body="کالای امانی مشتریان اینجا ثبت می‌شود." />
      ) : (
        <table className={ui.table}>
          <thead>
            <tr>
              <th>کد</th>
              <th>محصول</th>
              <th>مقدار (تن)</th>
              <th>هزینهٔ ماهانه</th>
              <th>تاریخ ثبت</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="tnum">
                  <bdi>{it.ref}</bdi>
                </td>
                <td>
                  {it.product}
                  {it.sizeLabel ? <span className={ui.muted}> · {it.sizeLabel}</span> : null}
                </td>
                <td className="tnum">{toPersianDigits(it.quantityTons)}</td>
                <td className="tnum">{formatToman(it.monthlyFeeToman, false)} تومان</td>
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
        <Heading level={3}>ثبت کالای جدید</Heading>
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
  );
}
