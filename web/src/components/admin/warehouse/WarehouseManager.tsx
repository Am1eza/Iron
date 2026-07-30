'use client';
/** Consignment warehouse — all customers' stock + receive new items +
 *  per-customer settlement report (US-08.5, hardened W20 for per-ton
 *  billing, search/pagination, intake details and a void/paid ledger). */
import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { WAREHOUSE_STATUS_LABEL, type WarehouseStatus, type WarehouseItem } from '@/lib/types/domain';
import { formatToman, normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';
import { can } from '@/lib/auth/roles';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Heading,
  Spinner,
  TableSkeleton,
  Tabs,
  TabPanel,
  Text,
  useConfirm,
} from '@/components/ui';
import { TextInput, Textarea } from '@/components/forms/fields';
import { JalaliDateField } from '../JalaliDateField';
import { PagerFooter } from '../PagerFooter';
import ui from '../adminUi.module.css';

const STATUSES = Object.entries(WAREHOUSE_STATUS_LABEL) as [WarehouseStatus, string][];
// Ordinal lifecycle (matches WAREHOUSE_STATUSES in
// lib/server/db/schema/orders.ts) — the status <select> only ever offers
// the current status plus what's still ahead of it, never something behind.
const STATUS_ORDER: WarehouseStatus[] = ['pending', 'stored', 'selling', 'released'];

type AdminWarehouseItem = WarehouseItem & { userId: string; customerMobile: string; customerName: string | null };

function ItemEditFields({ item, canEditFee }: { item: AdminWarehouseItem; canEditFee: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(item.quantityTons));
  const [fee, setFee] = useState(String(item.monthlyFeeToman));

  const qtyNum = Number(normalizeDigits(qty));
  const feeNum = Number(normalizeDigits(fee));
  // W20 audit fix: clearing the input to '' used to silently save as 0
  // (`Number('') === 0`) — a rate/qty of zero must be an explicit, valid
  // typed value, never the accidental result of an empty field.
  const qtyValid = normalizeDigits(qty).trim() !== '' && Number.isFinite(qtyNum) && qtyNum > 0;
  const feeValid = !canEditFee || (normalizeDigits(fee).trim() !== '' && Number.isFinite(feeNum) && feeNum > 0);
  const dirty = normalizeDigits(qty) !== String(item.quantityTons) || (canEditFee && normalizeDigits(fee) !== String(item.monthlyFeeToman));
  const valid = qtyValid && feeValid;

  const save = useMutation({
    mutationFn: () => {
      const patch: { quantityTons: number; monthlyFeeToman?: number } = { quantityTons: qtyNum };
      if (canEditFee) patch.monthlyFeeToman = feeNum;
      return adminApi.updateWarehouseItem(item.id, patch);
    },
    onSuccess: () => {
      toast.success('مقدار/هزینه به‌روزرسانی شد.');
      void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود.'),
  });

  return (
    <span style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        className={ui.numInput}
        style={{ inlineSize: '6rem' }}
        inputMode="decimal"
        value={qty}
        disabled={save.isPending}
        onChange={(e) => setQty(e.target.value)}
        aria-label={`مقدار ${item.ref} (تن)`}
        aria-invalid={!qtyValid || undefined}
      />
      <input
        className={ui.numInput}
        inputMode="numeric"
        value={fee}
        disabled={!canEditFee || save.isPending}
        onChange={(e) => setFee(e.target.value)}
        aria-label={`هزینهٔ ماهانهٔ هر تن ${item.ref}`}
        aria-invalid={(canEditFee && !feeValid) || undefined}
        title={!canEditFee ? 'تغییر هزینهٔ ماهانه فقط از عهدهٔ مدیر سیستم برمی‌آید.' : undefined}
      />
      {dirty ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
          ذخیره
        </Button>
      ) : null}
    </span>
  );
}

/** Append-only intake/release/adjustment ledger for one item (W20). */
const MOVEMENT_KIND_LABEL: Record<string, string> = {
  receipt: 'ورود به انبار',
  release: 'خروج از انبار',
  adjustment: 'اصلاح مقدار',
};

function MovementHistory({ warehouseItemId, panelId }: { warehouseItemId: string; panelId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'warehouse', 'movements', warehouseItemId],
    queryFn: () => adminApi.warehouseMovements(warehouseItemId),
  });
  const movements = data?.movements ?? [];

  return (
    <div id={panelId} className={ui.panel}>
      {isLoading ? (
        <Spinner label="در حال بارگذاری سابقهٔ حرکت" />
      ) : isError ? (
        <Text color="muted">بارگذاری سابقهٔ حرکت ناموفق بود.</Text>
      ) : movements.length === 0 ? (
        <Text color="muted">حرکتی ثبت نشده.</Text>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--space-1)' }}>
          {movements.map((m) => (
            <li key={m.id} className="tnum">
              <span className={ui.muted}>{formatJalali(m.createdAt)}</span> ·{' '}
              {MOVEMENT_KIND_LABEL[m.kind] ?? m.kind} ·{' '}
              {m.deltaTons > 0 ? '+' : ''}
              {toPersianDigits(m.deltaTons)} تن (مانده: {toPersianDigits(m.quantityAfterTons)} تن)
              {m.note ? <span className={ui.muted}> — {m.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WarehouseItemRow({
  item,
  canManage,
  confirm,
}: {
  item: AdminWarehouseItem;
  canManage: boolean;
  // Lifted to the parent (see WarehouseManager): useConfirm()'s dialog
  // renders a fixed-position Modal, which is invalid HTML as a direct
  // sibling of table rows — a single shared instance rendered outside the
  // <table> lets every row still ask for confirmation.
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [showMovements, setShowMovements] = useState(false);
  const movementsPanelId = useId();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });

  const updateStatus = useMutation({
    mutationFn: (status: WarehouseStatus) => adminApi.updateWarehouseItem(item.id, { status }),
    onSuccess: () => {
      toast.success('وضعیت کالا به‌روزرسانی شد.');
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی وضعیت ناموفق بود.');
      invalidate();
    },
  });

  const del = useMutation({
    mutationFn: (force: boolean) => adminApi.deleteWarehouseItem(item.id, force),
    onSuccess: () => {
      toast.success('کالا حذف شد.');
      invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'unsettled_balance') {
        void confirm({
          title: 'حذف با وجود بدهی',
          body: `${err.message} حذف این کالا بدهی ثبت‌شده را نیز از بین می‌برد و قابل بازگشت نیست. حذف با وجود بدهی؟`,
          confirmLabel: 'حذف با وجود بدهی',
        }).then((ok) => {
          if (ok) del.mutate(true);
        });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'حذف کالا ناموفق بود.');
    },
  });

  const askDelete = () => {
    void confirm({
      title: 'حذف کالا',
      body: `کالای ${item.ref} از انبار حذف می‌شود. این عملیات قابل بازگشت نیست.`,
      confirmLabel: 'حذف',
    }).then((ok) => {
      if (ok) del.mutate(false);
    });
  };

  const idx = STATUS_ORDER.indexOf(item.status);
  const forwardOptions = STATUS_ORDER.filter((_, i) => i >= idx);
  const rowBusy = updateStatus.isPending || del.isPending;

  return (
    <>
      <tr>
        <td className="tnum">
          <bdi>{item.ref}</bdi>
        </td>
        <td className={`tnum ${ui.mono}`}>
          {item.customerName ?? '—'}
          <div className={ui.muted}>
            <a href={`tel:${item.customerMobile}`} dir="ltr">
              {toPersianDigits(item.customerMobile)}
            </a>
          </div>
        </td>
        <td>
          {item.product}
          {item.sizeLabel ? <span className={ui.muted}> · {item.sizeLabel}</span> : null}
          {item.location ? <div className={ui.muted}>محل: {item.location}</div> : null}
        </td>
        <td>
          <ItemEditFields item={item} canEditFee={canManage} />
        </td>
        <td className="tnum">{formatJalali(item.arrivedAt ?? item.storedAt)}</td>
        <td className="tnum">{item.unsettledToman != null ? formatToman(item.unsettledToman) : '—'}</td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {forwardOptions.length > 1 ? (
              <select
                className={ui.select}
                value={item.status}
                disabled={rowBusy}
                onChange={(e) => updateStatus.mutate(e.target.value as WarehouseStatus)}
                aria-label={`وضعیت ${item.ref}`}
              >
                {forwardOptions.map((s) => (
                  <option key={s} value={s}>
                    {WAREHOUSE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              <Badge tone="neutral">{WAREHOUSE_STATUS_LABEL[item.status]}</Badge>
            )}
            {updateStatus.isPending ? <Spinner size={16} label="در حال به‌روزرسانی وضعیت" /> : null}
          </div>
        </td>
        <td>
          <div className={ui.rowActions}>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showMovements}
              aria-controls={movementsPanelId}
              onClick={() => setShowMovements((v) => !v)}
            >
              {showMovements ? 'بستن سابقه' : 'سابقهٔ حرکت'}
            </Button>
            {canManage ? (
              <Button size="sm" variant="ghost" loading={del.isPending} disabled={rowBusy} onClick={askDelete}>
                حذف
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
      {showMovements ? (
        <tr>
          <td colSpan={8}>
            <MovementHistory warehouseItemId={item.id} panelId={movementsPanelId} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const emptyForm = {
  mobile: '',
  customerName: '',
  product: '',
  sizeLabel: '',
  quantityTons: '',
  monthlyFeeToman: '',
  arrivedAt: '',
  location: '',
  contractRef: '',
  insured: false,
  intakeNote: '',
};

export function WarehouseManager() {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const currentUser = useAuthStore((st) => st.user);
  const canManage = can(currentUser?.role, 'leads:manage');
  const [tab, setTab] = useState('items');
  const [form, setForm] = useState(emptyForm);

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
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
    queryKey: ['admin', 'warehouse', status, q, page],
    queryFn: () => adminApi.warehouse({ page, status: status || undefined, q: q || undefined }),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'warehouse'] });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createWarehouseItem({
        mobile: normalizeDigits(form.mobile.trim()),
        customerName: form.customerName.trim() || undefined,
        product: form.product.trim(),
        sizeLabel: form.sizeLabel.trim() || undefined,
        quantityTons: Number(normalizeDigits(form.quantityTons)),
        monthlyFeeToman: form.monthlyFeeToman ? Number(normalizeDigits(form.monthlyFeeToman)) : undefined,
        arrivedAt: form.arrivedAt ? new Date(`${form.arrivedAt}T12:00:00`).toISOString() : undefined,
        location: form.location.trim() || undefined,
        contractRef: form.contractRef.trim() || undefined,
        insured: form.insured || undefined,
        intakeNote: form.intakeNote.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        res.registeredNewCustomer
          ? `کالا با شمارهٔ ${res.item.ref} ثبت شد و مشتری جدید ${toPersianDigits(res.customer.mobile)} به نام ${res.customer.name ?? ''} ساخته شد.`
          : `کالا با شمارهٔ ${res.item.ref} ثبت شد.`,
      );
      setForm(emptyForm);
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
          <div className={ui.toolbar}>
            <Chip selected={status === ''} onClick={() => setStatus('')}>
              همه
            </Chip>
            {STATUSES.map(([value, label]) => (
              <Chip key={value} selected={status === value} onClick={() => setStatus(value)}>
                {label}
              </Chip>
            ))}
            <input
              className={ui.textCell}
              style={{ inlineSize: '16rem', marginInlineStart: 'auto' }}
              placeholder="جستجو: کد، محصول، نام یا موبایل مشتری…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="جستجوی کالای انبار"
            />
          </div>

          {isLoading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : isError ? (
            <EmptyState
              size="section"
              tone="error"
              headline="بارگذاری انبار ناموفق بود."
              primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              size="section"
              headline={q || status ? 'با این فیلتر کالایی نیست' : 'انبار خالی است'}
              body="کالای امانی مشتریان اینجا ثبت می‌شود."
            />
          ) : (
            <>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <caption className="visually-hidden">فهرست کالاهای امانی انبار مشتریان</caption>
                  <thead>
                    <tr>
                      <th scope="col">کد</th>
                      <th scope="col">مشتری</th>
                      <th scope="col">محصول</th>
                      <th scope="col">مقدار (تن) / هزینهٔ هر تن</th>
                      <th scope="col">تاریخ ورود</th>
                      <th scope="col">بدهی تسویه‌نشده</th>
                      <th scope="col">وضعیت</th>
                      <th scope="col">
                        <span className="visually-hidden">عملیات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <WarehouseItemRow key={it.id} item={it} canManage={canManage} confirm={confirm} />
                    ))}
                  </tbody>
                </table>
              </div>
              {data ? <p className={ui.muted}>{toPersianDigits(data.total)} کالا</p> : null}
              {/* Server pages at 50/row (adminListWarehouse's default perPage). */}
              {data ? <PagerFooter page={page} perPage={50} total={data.total} onPage={setPage} /> : null}
            </>
          )}
          {dialog}

          <Card>
            <Heading level={2}>ثبت کالای جدید</Heading>
            <div className={ui.grid2} style={{ marginBlockStart: 'var(--space-3)' }}>
              <TextInput
                label="موبایل مشتری"
                inputMode="numeric"
                dir="ltr"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                helper="اگر مشتری ثبت‌نام نکرده، نام او را هم در فیلد کنار وارد کنید تا حساب جدید ساخته شود."
              />
              <TextInput
                label="نام مشتری (فقط برای مشتری جدید)"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
              <TextInput label="محصول" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
              <TextInput label="سایز (اختیاری)" value={form.sizeLabel} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })} />
              <TextInput
                label="مقدار (تن)"
                inputMode="decimal"
                value={form.quantityTons}
                onChange={(e) => setForm({ ...form, quantityTons: e.target.value })}
              />
              {canManage ? (
                <TextInput
                  label="هزینهٔ ماهانه هر تن (تومان، اختیاری)"
                  inputMode="numeric"
                  value={form.monthlyFeeToman}
                  onChange={(e) => setForm({ ...form, monthlyFeeToman: e.target.value })}
                />
              ) : (
                // Same tier as editing an existing item's fee — setting the
                // rate at intake is exactly as consequential (server 403s
                // leads:write here too), so a rep never sees the field.
                <TextInput
                  label="هزینهٔ ماهانه هر تن"
                  value="—"
                  disabled
                  helper="تعیین هزینهٔ ماهانه فقط از عهدهٔ مدیر سیستم برمی‌آید."
                />
              )}
              <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
                <span className={ui.muted}>تاریخ ورود فیزیکی (اختیاری)</span>
                <JalaliDateField
                  value={form.arrivedAt}
                  onChange={(iso) => setForm({ ...form, arrivedAt: iso })}
                  label="تاریخ ورود فیزیکی"
                />
              </div>
              <TextInput label="محل انبار (اختیاری)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              <TextInput
                label="شمارهٔ قرارداد (اختیاری)"
                value={form.contractRef}
                onChange={(e) => setForm({ ...form, contractRef: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.insured}
                  onChange={(e) => setForm({ ...form, insured: e.target.checked })}
                />
                <span>بیمه‌شده</span>
              </label>
            </div>
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              <Textarea
                label="یادداشت ورود (اختیاری)"
                value={form.intakeNote}
                onChange={(e) => setForm({ ...form, intakeNote: e.target.value })}
                rows={2}
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
        <SettlementPanel items={items} canManage={canManage} />
      </TabPanel>
    </div>
  );
}

/** Per-customer settlement (US-08.5) — backed by the real
 *  warehouseSettlements ledger: each "ثبت تسویه" freezes a period + the
 *  item's qty/fee snapshot as a permanent billing record, computed pro-rata
 *  since the last settlement (or since arrival if never settled). Corrections
 *  are a reversing entry (void), never an edit/delete. */
function SettlementPanel({ items, canManage }: { items: AdminWarehouseItem[]; canManage: boolean }) {
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const detailPanelId = useId();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'warehouse', 'settlement-customers'],
    queryFn: () => adminApi.settlementCustomers(),
  });
  const customers = data?.customers ?? [];
  const totalUnsettled = customers.reduce((sum, c) => sum + c.totalUnsettledToman, 0);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {!isLoading && !isError ? (
        <Card>
          <div className={ui.toolbar} style={{ marginBlockEnd: 0 }}>
            <Text>مجموع بدهی تسویه‌نشدهٔ همهٔ مشتریان</Text>
            <strong className="tnum" style={{ marginInlineStart: 'auto' }}>
              {formatToman(totalUnsettled)}
            </strong>
          </div>
        </Card>
      ) : null}

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
        <div className={ui.tableWrap}>
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
              {customers.map((c) => {
                const isOpen = openCustomer === c.userId;
                return (
                  <tr key={c.userId}>
                    <td className={`tnum ${ui.mono}`}>
                      {c.name ?? '—'}
                      <div className={ui.muted}>
                        <a href={`tel:${c.mobile}`} dir="ltr">
                          {toPersianDigits(c.mobile)}
                        </a>
                      </div>
                    </td>
                    <td className="tnum">{toPersianDigits(c.activeItemCount)}</td>
                    <td className="tnum">{formatToman(c.totalUnsettledToman)}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={isOpen}
                        aria-controls={detailPanelId}
                        onClick={() => setOpenCustomer(isOpen ? null : c.userId)}
                      >
                        {isOpen ? 'بستن' : 'جزئیات'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {openCustomer ? (
        <div id={detailPanelId}>
          <CustomerSettlementDetail userId={openCustomer} items={items} canManage={canManage} />
        </div>
      ) : null}
    </div>
  );
}

function CustomerSettlementDetail({
  userId,
  items,
  canManage,
}: {
  userId: string;
  items: AdminWarehouseItem[];
  canManage: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'warehouse', 'settlement', userId],
    queryFn: () => adminApi.settlementsForCustomer(userId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'warehouse', 'settlement'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'warehouse', 'settlement-customers'] });
  };

  const settle = useMutation({
    mutationFn: ({ warehouseItemId, note }: { warehouseItemId: string; note?: string }) =>
      adminApi.createSettlement(warehouseItemId, note || undefined),
    onSuccess: (_res, vars) => {
      toast.success('تسویه ثبت شد.');
      setNotes((prev) => ({ ...prev, [vars.warehouseItemId]: '' }));
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت تسویه ناموفق بود.'),
  });

  const voidSettlement = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => adminApi.voidSettlement(id, reason),
    onSuccess: () => {
      toast.success('تسویه باطل شد.');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ابطال تسویه ناموفق بود.'),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => adminApi.markSettlementPaid(id, note),
    onSuccess: () => {
      toast.success('پرداخت ثبت شد.');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'ثبت پرداخت ناموفق بود.'),
  });

  const askVoid = (id: string) => {
    void confirm({
      title: 'ابطال تسویه',
      body: 'یک قید معکوس (اصلاحی) برای این تسویه ثبت می‌شود؛ رکورد اصلی حذف نمی‌شود. ادامه؟',
      confirmLabel: 'ابطال کن',
    }).then((ok) => {
      if (ok) voidSettlement.mutate({ id });
    });
  };

  const productLabel = (warehouseItemId: string) => items.find((i) => i.id === warehouseItemId)?.product ?? warehouseItemId;

  if (isLoading || !data) {
    return (
      <Card>
        <Spinner label="در حال بارگذاری" />
      </Card>
    );
  }

  return (
    <Card>
      <Heading level={2}>
        تسویه‌حساب {data.user.name ?? data.user.mobile}{' '}
        <span className={`${ui.muted} tnum`}>
          <a href={`tel:${data.user.mobile}`} dir="ltr">
            {toPersianDigits(data.user.mobile)}
          </a>
        </span>
      </Heading>

      <div style={{ marginBlockStart: 'var(--space-2)' }}>
        <Text color="muted">مبلغ تسویه‌نشدهٔ هر قلم (از آخرین تسویه یا تاریخ ورود تا الان)</Text>
      </div>
      {data.unsettled.length === 0 ? (
        <p className={ui.muted}>قلم فعالی نیست.</p>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--space-2)', marginBlockStart: 'var(--space-2)' }}>
          {data.unsettled.map((u) => {
            const settling = settle.isPending && settle.variables?.warehouseItemId === u.warehouseItemId;
            return (
              <li key={u.warehouseItemId} className="tnum" style={{ display: 'grid', gap: 'var(--space-1)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 auto' }}>
                    {productLabel(u.warehouseItemId)} · {toPersianDigits(u.quantityTons)} تن ×{' '}
                    {formatToman(u.monthlyFeeToman)}/ماه · {toPersianDigits(Math.round(u.days))} روز
                  </span>
                  <span>{formatToman(u.amountToman)}</span>
                </div>
                {canManage ? (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      className={ui.textCell}
                      style={{ inlineSize: '14rem' }}
                      placeholder="یادداشت (اختیاری)"
                      value={notes[u.warehouseItemId] ?? ''}
                      disabled={settling}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [u.warehouseItemId]: e.target.value }))}
                      aria-label={`یادداشت تسویهٔ ${productLabel(u.warehouseItemId)}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={settling}
                      disabled={u.amountToman <= 0 || settle.isPending}
                      onClick={() => settle.mutate({ warehouseItemId: u.warehouseItemId, note: notes[u.warehouseItemId] })}
                    >
                      ثبت تسویه
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginBlockStart: 'var(--space-4)' }}>
        <Text color="muted">تاریخچهٔ تسویه‌ها</Text>
      </div>
      {data.history.length === 0 ? (
        <p className={ui.muted}>هنوز تسویه‌ای ثبت نشده.</p>
      ) : (
        <ul style={{ marginBlockStart: 'var(--space-2)', display: 'grid', gap: 'var(--space-2)' }}>
          {data.history.map((h) => {
            const isReversal = h.voidsSettlementId !== null;
            const isVoided = h.voidedAt !== null;
            const voiding = voidSettlement.isPending && voidSettlement.variables?.id === h.id;
            const paying = markPaid.isPending && markPaid.variables?.id === h.id;
            return (
              <li
                key={h.id}
                className="tnum"
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  ...(isVoided || isReversal ? { textDecoration: isVoided ? 'line-through' : undefined, opacity: 0.75 } : {}),
                }}
              >
                <span style={{ flex: '1 1 auto' }}>
                  {productLabel(h.warehouseItemId)} · {toPersianDigits(h.quantityTons)} تن × {formatToman(h.monthlyFeeToman)}/ماه ·{' '}
                  {formatJalali(h.periodFrom)} تا {formatJalali(h.periodTo)} — {formatToman(h.amountToman)}
                  {h.note ? <span className={ui.muted}> · {h.note}</span> : null}
                </span>
                {isReversal ? <Badge tone="stale">اصلاحی</Badge> : null}
                {isVoided ? <Badge tone="loss">باطل‌شده</Badge> : null}
                {h.paidAt ? <Badge tone="gain">پرداخت‌شده</Badge> : null}
                {canManage && !isReversal && !isVoided ? (
                  <div className={ui.rowActions}>
                    {!h.paidAt ? (
                      <Button size="sm" variant="ghost" loading={paying} onClick={() => markPaid.mutate({ id: h.id })}>
                        ثبت پرداخت
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" loading={voiding} onClick={() => askVoid(h.id)}>
                      ابطال
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </Card>
  );
}
