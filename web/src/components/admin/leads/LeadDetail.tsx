'use client';
/**
 * Lead detail panel — items, notes, status transitions, پیش‌فاکتور issue and
 * convert-to-order. Every mutation invalidates the CRM queries.
 */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import type { LineItem } from '@/lib/types/domain';
import { useAuthStore } from '@/lib/stores/auth';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { formatJalali, formatToman, normalizeDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Spinner } from '@/components/ui';
import ui from '../adminUi.module.css';

/** One editable line item — qty/unitPrice, before proforma issuance (US-19.4). */
function EditableItemRow({ leadId, item, onSaved }: { leadId: string; item: LineItem & { id: string }; onSaved: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState(String(item.qty));
  const [price, setPrice] = useState(item.unitPrice ? String(item.unitPrice) : '');
  const dirty = normalizeDigits(qty) !== String(item.qty) || normalizeDigits(price || '0') !== String(item.unitPrice ?? 0);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateLeadItem(leadId, item.id, {
        qty: Number(normalizeDigits(qty)),
        unitPrice: price ? Number(normalizeDigits(price)) : 0,
      }),
    onSuccess: () => {
      toast.success('قلم به‌روزرسانی شد.');
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی قلم ناموفق بود.'),
  });

  return (
    <li className="tnum" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 auto' }}>{item.name}</span>
      <input
        className={ui.numInput}
        style={{ inlineSize: '5rem' }}
        inputMode="decimal"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        aria-label={`تعداد ${item.name}`}
      />
      <input
        className={ui.numInput}
        inputMode="numeric"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label={`قیمت واحد ${item.name}`}
        placeholder="بدون قیمت"
      />
      {dirty ? (
        <Button size="sm" variant="ghost" onClick={() => save.mutate()} loading={save.isPending}>
          ذخیره
        </Button>
      ) : null}
    </li>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'lead', id],
    queryFn: () => adminApi.lead(id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'lead', id] });
    void qc.invalidateQueries({ queryKey: ['admin', 'leads'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };
  const onError = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const setStatus = useMutation({
    mutationFn: (status: string) => adminApi.updateLead(id, { status }),
    onSuccess: invalidate,
    onError: (e) => onError(e, 'تغییر وضعیت ناموفق بود.'),
  });
  const addNote = useMutation({
    mutationFn: (text: string) => adminApi.addLeadNote(id, text),
    onSuccess: () => {
      setNote('');
      invalidate();
    },
    onError: (e) => onError(e, 'ثبت یادداشت ناموفق بود.'),
  });
  const issue = useMutation({
    mutationFn: () => adminApi.issueProforma(id, discount ? Number(normalizeDigits(discount)) : undefined),
    onSuccess: (res) => {
      toast.success(`پیش‌فاکتور ${res.proforma.ref} صادر و پیامک شد.`);
      setDiscount('');
      invalidate();
    },
    onError: (e) => onError(e, 'صدور پیش‌فاکتور ناموفق بود.'),
  });
  const convert = useMutation({
    mutationFn: () => adminApi.convertToOrder(id),
    onSuccess: (res) => {
      toast.success(`سفارش ${res.order.ref} ساخته شد (قابل رهگیری در /track).`);
      invalidate();
    },
    onError: (e) => onError(e, 'تبدیل به سفارش ناموفق بود.'),
  });

  const currentUser = useAuthStore((st) => st.user);
  const { data: staffData } = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => adminApi.staff() });
  const staff = staffData?.staff ?? [];
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => adminApi.updateLead(id, { assigneeId }),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    },
    onError: (e) => onError(e, 'واگذاری ناموفق بود.'),
  });
  const setCallback = useMutation({
    mutationFn: (callbackAt: string | null) => adminApi.updateLead(id, { callbackAt }),
    onSuccess: () => {
      toast.success('زمان تماس ثبت شد.');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    },
    onError: (e) => onError(e, 'ثبت زمان تماس ناموفق بود.'),
  });

  if (isLoading || !data) {
    return (
      <div className={ui.panel}>
        <Spinner />
      </div>
    );
  }

  const { lead, items, notes, proformas } = data;
  const noteText = (lead.context?.note as string | undefined) ?? '';

  return (
    <div className={ui.panel} onClick={(e) => e.stopPropagation()}>
      <div className={ui.grid2}>
        <div>
          <h2>اقلام</h2>
          {items.length === 0 ? (
            <p className={ui.muted}>بدون قلم کالا.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {items.map((it) => (
                <EditableItemRow key={it.id} leadId={id} item={it} onSaved={invalidate} />
              ))}
            </ul>
          )}
          {noteText ? <p className={ui.muted}>یادداشت مشتری: {noteText}</p> : null}

          <h2 style={{ marginBlockStart: 'var(--space-3)' }}>پیش‌فاکتورها</h2>
          {proformas.length === 0 ? (
            <p className={ui.muted}>صادر نشده.</p>
          ) : (
            <ul>
              {proformas.map((p) => (
                <li key={p.id} className="tnum">
                  <bdi>{p.ref}</bdi> — {formatToman(p.total, false)} تومان · اعتبار تا{' '}
                  {formatJalali(p.validUntil)}{' '}
                  <Badge tone={p.status === 'active' ? 'gain' : 'stale'}>
                    {p.status === 'active' ? 'فعال' : 'منقضی'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className={ui.toolbar} style={{ marginBlockStart: 'var(--space-3)' }}>
            {lead.status === 'new' ? (
              <Button size="sm" onClick={() => setStatus.mutate('contacted')} loading={setStatus.isPending}>
                تماس گرفته شد
              </Button>
            ) : null}
            {lead.status === 'contacted' ? (
              <>
                <Button size="sm" onClick={() => setStatus.mutate('won')} loading={setStatus.isPending}>
                  موفق
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStatus.mutate('lost')}>
                  ناموفق
                </Button>
              </>
            ) : null}
            <input
              className={ui.numInput}
              style={{ inlineSize: '8rem' }}
              inputMode="numeric"
              placeholder="تخفیف (تومان)"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              aria-label="تخفیف پیش‌فاکتور به تومان"
            />
            <Button size="sm" variant="secondary" onClick={() => issue.mutate()} loading={issue.isPending}>
              صدور پیش‌فاکتور
            </Button>
            <Button size="sm" variant="secondary" onClick={() => convert.mutate()} loading={convert.isPending}>
              تبدیل به سفارش
            </Button>
          </div>

          <h2 style={{ marginBlockStart: 'var(--space-4)' }}>واگذاری و پیگیری</h2>
          <div className={ui.toolbar} style={{ alignItems: 'center' }}>
            {currentUser && lead.assigneeId !== currentUser.id ? (
              <Button size="sm" onClick={() => assign.mutate(currentUser.id)} loading={assign.isPending}>
                سرنخ من
              </Button>
            ) : null}
            <select
              className={ui.select}
              aria-label="کارشناس مسئول"
              value={lead.assigneeId ?? ''}
              onChange={(e) => assign.mutate(e.target.value || null)}
            >
              <option value="">— بدون کارشناس —</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.name ?? m.mobile) + ' · ' + ROLE_LABEL[m.role as Role]}
                </option>
              ))}
            </select>
            <label className={ui.muted} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              زمان تماس:
              <input
                type="date"
                className={ui.textCell}
                aria-label="زمان تماس بعدی"
                defaultValue={lead.callbackAt ? lead.callbackAt.slice(0, 10) : ''}
                onChange={(e) =>
                  setCallback.mutate(e.target.value ? new Date(e.target.value).toISOString() : null)
                }
              />
            </label>
          </div>
        </div>

        <div>
          <h2>یادداشت‌ها</h2>
          {notes.length === 0 ? (
            <p className={ui.muted}>یادداشتی نیست.</p>
          ) : (
            <ul>
              {notes.map((n) => (
                <li key={n.id}>
                  {n.text} <span className={`${ui.muted} tnum`}>({formatJalali(n.at)})</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className={ui.textCell}
            style={{ inlineSize: '100%', minBlockSize: '5rem', marginBlockStart: 'var(--space-2)' }}
            placeholder="یادداشت کارشناس…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="یادداشت جدید"
          />
          <Button
            size="sm"
            style={{ marginBlockStart: 'var(--space-2)' }}
            onClick={() => note.trim() && addNote.mutate(note.trim())}
            loading={addNote.isPending}
          >
            ثبت یادداشت
          </Button>
        </div>
      </div>
    </div>
  );
}
