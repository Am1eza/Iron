'use client';
/**
 * The daily pricing grid — keyboard-first bulk price entry. Edited rows are
 * tracked locally; one PUT saves them all (movement/history/audit server-side).
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { categories } from '@/lib/mock/fixtures';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { normalizeDigits, toPersianDigits, formatJalali } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, EmptyState, MovementBadge, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

type Draft = { price?: string; deliveryTime?: string };

export function PricingGrid() {
  const toast = useToast();
  const qc = useQueryClient();
  const [cat, setCat] = useState('rebar');
  const [sub, setSub] = useState('');
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const tableRef = useRef<HTMLTableElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'pricing', cat, sub],
    queryFn: () => adminApi.pricingGrid(cat, sub || undefined),
  });

  const save = useMutation({
    mutationFn: adminApi.savePrices,
    onSuccess: (res) => {
      // Partial failures (e.g. a stale/removed SKU) are reported, not
      // silently dropped — keep those rows' drafts so the admin can retry;
      // clear only the ones that actually saved.
      if (res.saved > 0) {
        toast.success(`${toPersianDigits(res.saved)} قیمت ذخیره شد.`);
      }
      if (res.failed > 0) {
        const failedIds = new Set(res.results.filter((r) => !r.ok).map((r) => r.skuId));
        toast.error(`${toPersianDigits(res.failed)} قیمت ذخیره نشد؛ دوباره تلاش کنید.`);
        setDrafts((prev) => new Map([...prev].filter(([skuId]) => failedIds.has(skuId))));
      } else {
        setDrafts(new Map());
      }
      void qc.invalidateQueries({ queryKey: ['admin', 'pricing'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'ذخیرهٔ قیمت‌ها ناموفق بود.'),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const subs = CATEGORY_SUBS[cat] ?? [];

  const setDraft = (skuId: string, patch: Draft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(skuId, { ...next.get(skuId), ...patch });
      return next;
    });
  };

  const dirty = useMemo(() => {
    const out: Array<{ skuId: string; price: number; deliveryTime?: string }> = [];
    for (const [skuId, d] of drafts) {
      const row = rows.find((r) => r.id === skuId);
      if (!row) continue;
      const price = d.price !== undefined ? Number(normalizeDigits(d.price)) : row.current.price;
      if (!Number.isFinite(price) || price <= 0) continue;
      const changed =
        (d.price !== undefined && price !== row.current.price) ||
        (d.deliveryTime !== undefined && d.deliveryTime !== row.current.deliveryTime);
      if (changed) out.push({ skuId, price, deliveryTime: d.deliveryTime ?? row.current.deliveryTime });
    }
    return out;
  }, [drafts, rows]);

  const focusNext = (i: number) => {
    const next = tableRef.current?.querySelector<HTMLInputElement>(`[data-price-index="${i + 1}"]`);
    next?.focus();
    next?.select();
  };

  return (
    <div>
      <div className={ui.toolbar}>
        <select className={ui.select} value={cat} onChange={(e) => { setCat(e.target.value); setSub(''); setDrafts(new Map()); }} aria-label="دسته">
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select className={ui.select} value={sub} onChange={(e) => { setSub(e.target.value); setDrafts(new Map()); }} aria-label="زیر‌دسته">
          <option value="">همهٔ زیر‌دسته‌ها</option>
          {subs.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <span className={ui.muted}>{toPersianDigits(rows.length)} کالا</span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState size="section" headline="کالایی در این دسته نیست" body="از بخش کاتالوگ کالا اضافه کنید." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={ui.table} ref={tableRef}>
            <thead>
              <tr>
                <th>کالا</th>
                <th>سایز</th>
                <th>کارخانه</th>
                <th>قیمت (تومان)</th>
                <th>زمان تحویل</th>
                <th>نوسان</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = drafts.get(r.id);
                const isDirty = dirty.some((x) => x.skuId === r.id);
                return (
                  <tr key={r.id} className={isDirty ? ui.rowDirty : undefined}>
                    <td>{r.name}</td>
                    <td className="tnum">{r.size ?? '—'}</td>
                    <td>{r.factory ?? '—'}</td>
                    <td>
                      <input
                        className={ui.numInput}
                        inputMode="numeric"
                        data-price-index={i}
                        value={d?.price ?? String(r.current.price || '')}
                        onChange={(e) => setDraft(r.id, { price: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusNext(i);
                          }
                        }}
                        aria-label={`قیمت ${r.name}`}
                      />
                    </td>
                    <td>
                      <input
                        className={ui.textCell}
                        value={d?.deliveryTime ?? r.current.deliveryTime}
                        onChange={(e) => setDraft(r.id, { deliveryTime: e.target.value })}
                        aria-label={`زمان تحویل ${r.name}`}
                      />
                    </td>
                    <td>
                      {r.current.movementPct != null ? (
                        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.current.priceHidden ? (
                        <Badge tone="loss">مخفی</Badge>
                      ) : r.current.isStale ? (
                        <Badge tone="stale">کهنه</Badge>
                      ) : (
                        <Badge tone="gain">به‌روز</Badge>
                      )}
                      <div className={ui.tileHint}>{formatJalali(r.current.updatedAt)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dirty.length > 0 ? (
        <div className={ui.stickyBar}>
          <span>{toPersianDigits(dirty.length)} قیمت تغییر کرده است.</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="ghost" onClick={() => setDrafts(new Map())}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate(dirty)} loading={save.isPending}>
              ذخیرهٔ {toPersianDigits(dirty.length)} قیمت
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
