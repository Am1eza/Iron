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
import { Badge, Button, EmptyState, Modal, MovementBadge, TableSkeleton } from '@/components/ui';
import ui from '../adminUi.module.css';

type Draft = { price?: string; deliveryTime?: string };

type PasteRow = { id: string; slug: string; name: string; size?: string };

/** Parse pasted "key<sep>price" lines (tab, comma, or 2+ spaces) and match each
 *  key against a row's slug / name / size (normalized). Returns the drafts to
 *  apply plus the keys that matched nothing, for a review-before-save preview. */
function matchPastedPrices(
  text: string,
  rows: PasteRow[],
): { matched: Array<{ id: string; price: string }>; unmatched: string[] } {
  const norm = (s: string) => normalizeDigits(s).trim().toLowerCase().replace(/\s+/g, ' ');
  const bySlug = new Map(rows.map((r) => [norm(r.slug), r.id]));
  const byName = new Map(rows.map((r) => [norm(r.name), r.id]));
  const bySize = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.size) continue;
    const k = norm(r.size);
    bySize.set(k, bySize.has(k) ? null : r.id); // null = ambiguous (skip)
  }
  const matched: Array<{ id: string; price: string }> = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|,|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const price = normalizeDigits(parts[parts.length - 1]!).replace(/[^\d]/g, '');
    const key = norm(parts.slice(0, -1).join(' '));
    if (!price) continue;
    const id = bySlug.get(key) ?? byName.get(key) ?? bySize.get(key) ?? null;
    if (id && !seen.has(id)) {
      seen.add(id);
      matched.push({ id, price });
    } else {
      unmatched.push(parts.slice(0, -1).join(' '));
    }
  }
  return { matched, unmatched };
}

export function PricingGrid() {
  const toast = useToast();
  const qc = useQueryClient();
  const [cat, setCat] = useState('rebar');
  const [sub, setSub] = useState('');
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const tableRef = useRef<HTMLTableElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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
  // `dirty` alone would need an O(n) `.some()` scan per row inside the table
  // body's `.map` below — O(n²) over the datasheet on every keystroke. A Set
  // makes that lookup O(1).
  const dirtySkuIds = useMemo(() => new Set(dirty.map((x) => x.skuId)), [dirty]);

  const focusNext = (i: number) => {
    const next = tableRef.current?.querySelector<HTMLInputElement>(`[data-price-index="${i + 1}"]`);
    next?.focus();
    next?.select();
  };

  // Switching category/sub-category used to clear `drafts` unconditionally
  // — an operator who edited several prices then clicked a filter to
  // double-check something lost all unsaved edits instantly, silently.
  const changeFilter = (apply: () => void) => {
    if (dirty.length > 0 && !window.confirm(`${dirty.length} قیمت ذخیره‌نشده دارید. با تغییر فیلتر از بین می‌رود — ادامه می‌دهید؟`)) {
      return;
    }
    setDrafts(new Map());
    apply();
  };

  const applyPaste = () => {
    const { matched, unmatched } = matchPastedPrices(pasteText, rows);
    if (matched.length === 0) {
      toast.error('هیچ ردیفی تطبیق نخورد. کلید هر خط باید با نام، اسلاگ یا سایز یکی از کالاهای این دسته بخواند.');
      return;
    }
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const m of matched) next.set(m.id, { ...next.get(m.id), price: m.price });
      return next;
    });
    toast.success(
      `${toPersianDigits(matched.length)} قیمت روی جدول پر شد${
        unmatched.length ? ` · ${toPersianDigits(unmatched.length)} خط بی‌تطبیق` : ''
      }. بررسی و ذخیره کنید.`,
    );
    setPasteText('');
    setPasteOpen(false);
  };

  return (
    <div>
      <div className={ui.toolbar}>
        <select
          className={ui.select}
          value={cat}
          onChange={(e) => {
            const next = e.target.value;
            changeFilter(() => {
              setCat(next);
              setSub('');
            });
          }}
          aria-label="دسته"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select
          className={ui.select}
          value={sub}
          onChange={(e) => {
            const next = e.target.value;
            changeFilter(() => setSub(next));
          }}
          aria-label="زیر‌دسته"
        >
          <option value="">همهٔ زیر‌دسته‌ها</option>
          {subs.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <span className={ui.muted}>{toPersianDigits(rows.length)} کالا</span>
        <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)} disabled={rows.length === 0}>
          چسباندن قیمت‌ها
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری جدول قیمت ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState size="section" headline="کالایی در این دسته نیست" body="از بخش کاتالوگ کالا اضافه کنید." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={ui.table} ref={tableRef}>
            <caption className="visually-hidden">جدول قیمت‌گذاری روزانه کالاها</caption>
            <thead>
              <tr>
                <th scope="col">کالا</th>
                <th scope="col">سایز</th>
                <th scope="col">کارخانه</th>
                <th scope="col">قیمت (تومان)</th>
                <th scope="col">زمان تحویل</th>
                <th scope="col">نوسان</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = drafts.get(r.id);
                const isDirty = dirtySkuIds.has(r.id);
                // A price the operator typed but that doesn't parse to a
                // valid positive number is silently excluded from `dirty`
                // (never saved) — previously with zero feedback, so the row
                // never got the dirty highlight and the save button never
                // included it, making it look like a no-op edit.
                const draftPrice = d?.price !== undefined ? Number(normalizeDigits(d.price)) : undefined;
                const isInvalidPrice = d?.price !== undefined && (!Number.isFinite(draftPrice) || draftPrice! <= 0);
                const priceErrId = `price-err-${r.id}`;
                return (
                  <tr key={r.id} className={isDirty ? ui.rowDirty : isInvalidPrice ? ui.rowInvalid : undefined}>
                    <td>
                      {r.name}
                      {isDirty ? <span className="visually-hidden"> (ویرایش نشده، ذخیره نشده)</span> : null}
                    </td>
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
                        aria-invalid={isInvalidPrice || undefined}
                        aria-describedby={isInvalidPrice ? priceErrId : undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusNext(i);
                          }
                        }}
                        aria-label={`قیمت ${r.name}`}
                      />
                      {isInvalidPrice ? (
                        <div id={priceErrId} className={ui.tileHint}>
                          عدد نامعتبر — ذخیره نمی‌شود
                        </div>
                      ) : null}
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

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="چسباندن دسته‌ای قیمت‌ها"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              انصراف
            </Button>
            <Button onClick={applyPaste} disabled={!pasteText.trim()}>
              اعمال روی جدول
            </Button>
          </>
        }
      >
        <p className={ui.muted} style={{ marginBlockStart: 0 }}>
          هر خط: «نام، اسلاگ یا سایز کالا» و سپس قیمت (جداشده با Tab، کاما یا فاصله). فقط جدول پر می‌شود؛
          سپس ردیف‌های تغییرکرده را بررسی و «ذخیره» کنید.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={10}
          dir="auto"
          aria-label="قیمت‌ها برای چسباندن"
          placeholder={'میلگرد ۱۴\t۲۸۵۰۰۰\nمیلگرد ۱۶، ۲۸۴۵۰۰'}
          style={{
            inlineSize: '100%',
            font: 'var(--t-input)',
            padding: 'var(--space-3)',
            border: 'var(--border-hairline) solid var(--color-hairline)',
            borderRadius: 'var(--radius-sm)',
            resize: 'vertical',
          }}
        />
      </Modal>
    </div>
  );
}
