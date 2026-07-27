'use client';
/**
 * The daily pricing grid — keyboard-first bulk price entry. Edited rows are
 * tracked locally; one PUT saves them all (movement/history/audit server-side).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, Modal, MovementBadge, TableSkeleton, useConfirm } from '@/components/ui';
import { Sparkline } from '../dashboard/Sparkline';
import ui from '../adminUi.module.css';

/** Per-row 30-day price trend (US-17.6). Fed by ONE batched query for the
 *  whole visible grid — the old per-row query fired one HTTP request per SKU
 *  (a 60-row category = 60 requests on every load). */
function RowSparkline({ series }: { series: number[] | undefined }) {
  if (!series || series.length < 2) return <span className={ui.muted}>—</span>;
  return <Sparkline data={series} width={64} height={22} />;
}

type Draft = { price?: string; deliveryTime?: string };
type GridCol = 'price' | 'delivery';

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
  // ?stale=1 → open pre-filtered to stale rows (the dashboard's «قیمت‌های
  // کهنه» tile deep-links here, so the operator lands ON the work, not
  // hunting for it).
  const params = useSearchParams();
  const [cat, setCat] = useState('rebar');
  const [sub, setSub] = useState('');
  const [onlyStale, setOnlyStale] = useState(params.get('stale') === '1');
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const tableRef = useRef<HTMLTableElement>(null);
  const { confirm, dialog } = useConfirm();

  // Live category list (not the mock fixture) — the filter dropdown must show
  // categories an admin created via the catalog CRUD (US-18.2), not just the
  // fixed seed set.
  const { data: catData } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: adminApi.categories,
    staleTime: 5 * 60 * 1000,
  });
  const categories = catData?.categories.filter((c) => c.isActive).sort((a, b) => a.order - b.order) ?? [];

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

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const staleCount = useMemo(
    () => allRows.filter((r) => r.current.isStale && !r.current.priceHidden).length,
    [allRows],
  );
  const rows = useMemo(
    () => (onlyStale ? allRows.filter((r) => r.current.isStale && !r.current.priceHidden) : allRows),
    [allRows, onlyStale],
  );

  // Live sub-category list for the selected category — NOT the static
  // CATEGORY_SUBS fixture (which silently misses/mismatches anything an admin
  // created via the catalog CRUD; the category list above was already live).
  const catId = categories.find((c) => c.slug === cat)?.id;
  const { data: subData } = useQuery({
    queryKey: ['admin', 'subcategories', catId],
    queryFn: () => adminApi.subCategories(catId),
    enabled: Boolean(catId),
    staleTime: 5 * 60 * 1000,
  });
  const subs = (subData?.subCategories ?? [])
    .filter((s) => s.isActive)
    .sort((a, b) => a.order - b.order);

  // One batched request for every visible row's sparkline series.
  const slugsKey = useMemo(() => allRows.map((r) => r.slug).sort().join(','), [allRows]);
  const { data: historyData } = useQuery({
    queryKey: ['admin', 'sku-history-batch', slugsKey],
    queryFn: () => adminApi.skuHistoryBatch(allRows.map((r) => r.slug)),
    enabled: allRows.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const seriesBySlug = historyData?.series;

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

  // Closing/reloading the tab with unsaved price edits used to lose them
  // silently — the in-app filter guard never covered the browser itself.
  useEffect(() => {
    if (dirty.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  // Vertical arrow-key navigation (US-17.5): each editable cell is addressed
  // by (row, column) rather than the old single `data-price-index` sequence,
  // which only ever covered the price column — the delivery-time column had
  // no keyboard navigation at all. Left/Right are deliberately left alone:
  // they're needed for caret movement inside the text value.
  const focusCell = (row: number, col: GridCol) => {
    const target = tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`);
    target?.focus();
    target?.select();
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: GridCol) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  };

  // Switching category/sub-category used to clear `drafts` unconditionally
  // — an operator who edited several prices then clicked a filter to
  // double-check something lost all unsaved edits instantly, silently.
  const changeFilter = (apply: () => void) => {
    if (dirty.length === 0) {
      setDrafts(new Map());
      apply();
      return;
    }
    void confirm({
      title: 'تغییر فیلتر',
      body: `${dirty.length} قیمت ذخیره‌نشده دارید. با تغییر فیلتر از بین می‌رود — ادامه می‌دهید؟`,
      confirmLabel: 'ادامه و ازدست‌دادن تغییرات',
    }).then((ok) => {
      if (!ok) return;
      setDrafts(new Map());
      apply();
    });
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
        <Chip selected={onlyStale} onClick={() => setOnlyStale((v) => !v)}>
          فقط کهنه‌ها{staleCount > 0 ? ` (${toPersianDigits(staleCount)})` : ''}
        </Chip>
        <span className={ui.muted}>{toPersianDigits(rows.length)} کالا</span>
        <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)} disabled={rows.length === 0}>
          چسباندن قیمت‌ها
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={7} />
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
        <div className={ui.tableWrap}>
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
                <th scope="col">روند ۳۰روزه</th>
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
                        data-row={i}
                        data-col="price"
                        value={d?.price ?? String(r.current.price || '')}
                        onChange={(e) => setDraft(r.id, { price: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-invalid={isInvalidPrice || undefined}
                        aria-describedby={isInvalidPrice ? priceErrId : undefined}
                        onKeyDown={(e) => handleCellKeyDown(e, i, 'price')}
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
                        data-row={i}
                        data-col="delivery"
                        value={d?.deliveryTime ?? r.current.deliveryTime}
                        onChange={(e) => setDraft(r.id, { deliveryTime: e.target.value })}
                        onKeyDown={(e) => handleCellKeyDown(e, i, 'delivery')}
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
                      <RowSparkline series={seriesBySlug?.[r.slug]} />
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
      {dialog}
    </div>
  );
}
