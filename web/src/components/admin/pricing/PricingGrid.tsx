'use client';
/**
 * The daily pricing grid — keyboard-first bulk price entry. Edited rows are
 * tracked locally; one PUT saves them all (movement/history/audit server-side).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { ApiError } from '@/lib/api/errors';
import { Badge, Button, Chip, EmptyState, Modal, MovementBadge, TableSkeleton, useConfirm } from '@/components/ui';
import { Sparkline } from '../dashboard/Sparkline';
import ui from '../adminUi.module.css';

/** A same-day price move this big is almost always a fat-fingered digit, not
 *  a real market swing — steel prices just don't jump this fast. Doesn't
 *  block saving (it might be genuinely right), just flags the row so the
 *  operator glances twice before hitting «ذخیره». */
const FAT_FINGER_THRESHOLD_PCT = 20;

function countDigits(s: string): number {
  let n = 0;
  for (const ch of normalizeDigits(s)) if (ch >= '0' && ch <= '9') n++;
  return n;
}

/** Digit-grouped price input — shows «۲۸۵٬۰۰۰» while the value underneath
 *  stays plain digits (what actually gets parsed/saved). A bare 6-7 digit
 *  Toman price is hard to eyeball for a stray or missing digit ungrouped.
 *  Caret position is preserved across reformatting by counting DIGITS (not
 *  characters) to the left of the caret and re-locating that same digit
 *  count in the reformatted string. */
function PriceCell({
  value,
  onChange,
  row,
  ariaInvalid,
  ariaDescribedby,
  ariaLabel,
  onKeyDown,
}: {
  value: string;
  onChange: (raw: string) => void;
  row: number;
  ariaInvalid: boolean;
  ariaDescribedby?: string;
  ariaLabel: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const group = (digits: string) => (digits ? toPersianDigits(Number(digits).toLocaleString('en-US')) : '');
  const display = group(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = countDigits(input.value.slice(0, caret));
    const digits = normalizeDigits(input.value).replace(/[^\d]/g, '');
    onChange(digits);
    const nextDisplay = group(digits);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      let seen = 0;
      let pos = nextDisplay.length;
      for (let i = 0; i < nextDisplay.length; i++) {
        if (/[0-9۰-۹]/.test(nextDisplay[i]!)) {
          seen++;
          if (seen === digitsBeforeCaret) {
            pos = i + 1;
            break;
          }
        }
      }
      if (digitsBeforeCaret === 0) pos = 0;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      ref={ref}
      className={ui.numInput}
      inputMode="numeric"
      data-row={row}
      data-col="price"
      value={display}
      onChange={handleChange}
      onFocus={(e) => e.currentTarget.select()}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedby}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
    />
  );
}

/** Per-row 30-day price trend (US-17.6). Fed by ONE batched query for the
 *  whole visible grid — the old per-row query fired one HTTP request per SKU
 *  (a 60-row category = 60 requests on every load). */
function RowSparkline({ series }: { series: number[] | undefined }) {
  if (!series || series.length < 2) return <span className={ui.muted}>—</span>;
  return <Sparkline data={series} width={64} height={22} />;
}

type Draft = { price?: string; deliveryTime?: string };
type GridCol = 'price' | 'delivery';

export type PasteRow = { id: string; slug: string; name: string; size?: string };

/** Parse pasted "key<sep>price" lines (tab, comma, or 2+ spaces) and match each
 *  key against a row's slug / name / size (normalized). Returns the drafts to
 *  apply plus the keys that matched nothing, for a review-before-save preview. */
export function matchPastedPrices(
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
  const router = useRouter();
  // ?stale=1 → open pre-filtered to stale rows (the dashboard's «قیمت‌های
  // کهنه» tile deep-links here, so the operator lands ON the work, not
  // hunting for it).
  const params = useSearchParams();
  const [cat, setCat] = useState('rebar');
  const [sub, setSub] = useState('');
  const [onlyStale, setOnlyStale] = useState(params.get('stale') === '1');
  const [q, setQ] = useState('');
  const [bulkPct, setBulkPct] = useState('');
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
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
        const failed = res.results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);
        // W23 review fix: the toast only ever said "N failed, try again" — the
        // route's per-row `error` string (route.ts's per-row fault isolation)
        // was fetched and thrown away. Keeping it per skuId lets the row show
        // WHY it failed, right where the operator is about to retry it.
        toast.error(`${toPersianDigits(res.failed)} قیمت ذخیره نشد؛ دوباره تلاش کنید.`);
        setDrafts((prev) => new Map([...prev].filter(([skuId]) => failed.some((f) => f.skuId === skuId))));
        setRowErrors(new Map(failed.map((f) => [f.skuId, f.error])));
      } else {
        setDrafts(new Map());
        setRowErrors(new Map());
      }
      void qc.invalidateQueries({ queryKey: ['admin', 'pricing'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'ذخیرهٔ قیمت‌ها ناموفق بود.'),
  });

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  // W23 review fix (H1): a stale-hidden price («تماس بگیرید») is a stale
  // price too — it's the row that has been stale the LONGEST, which is why
  // it got hidden in the first place (see priceFreshness.ts: `isHidden`
  // implies `isStale`). Excluding it here meant «فقط کهنه‌ها»,  the exact
  // filter an operator reaches for to find what needs fixing, hid the most
  // urgent rows from the list.
  const staleCount = useMemo(() => allRows.filter((r) => r.current.isStale).length, [allRows]);
  const rows = useMemo(() => {
    let out = onlyStale ? allRows.filter((r) => r.current.isStale) : allRows;
    const nq = normalizeDigits(q).trim().toLowerCase();
    if (nq) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(nq) ||
          r.slug.toLowerCase().includes(nq) ||
          (r.size ?? '').toLowerCase().includes(nq),
      );
    }
    return out;
  }, [allRows, onlyStale, q]);

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
    // A retried row's stale failure reason must not linger once the operator
    // has actually changed the value it complained about.
    setRowErrors((prev) => {
      if (!prev.has(skuId)) return prev;
      const next = new Map(prev);
      next.delete(skuId);
      return next;
    });
  };

  const dirty = useMemo(() => {
    const out: Array<{ skuId: string; price: number; deliveryTime?: string }> = [];
    for (const [skuId, d] of drafts) {
      // `allRows`, not the filtered `rows` — the search box and «فقط
      // کهنه‌ها» are VIEW filters. An edit made before typing a search term
      // (or before a row scrolled out of the stale-only view) must still be
      // included in what «ذخیره» submits; it was silently dropped from the
      // save payload the moment the row fell out of the filtered view.
      const row = allRows.find((r) => r.id === skuId);
      if (!row) continue;
      const price = d.price !== undefined ? Number(normalizeDigits(d.price)) : row.current.price;
      if (!Number.isFinite(price) || price <= 0) continue;
      const changed =
        (d.price !== undefined && price !== row.current.price) ||
        (d.deliveryTime !== undefined && d.deliveryTime !== row.current.deliveryTime);
      if (changed) out.push({ skuId, price, deliveryTime: d.deliveryTime ?? row.current.deliveryTime });
    }
    return out;
  }, [drafts, allRows]);
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

  // Shared "may I navigate away?" prompt — used by the click-interceptor
  // below AND registered as the global unsaved-guard so navigation that
  // never goes through an <a> click (the admin Command Palette's
  // router.push) asks the same question instead of silently discarding
  // drafts. Resolves true (and clears drafts) only if the operator confirms.
  const confirmLeave = () =>
    confirm({
      title: 'خروج از صفحه',
      body: `${toPersianDigits(dirty.length)} قیمت ذخیره‌نشده دارید. با خروج از این صفحه از بین می‌رود — ادامه می‌دهید؟`,
      confirmLabel: 'ادامه و ازدست‌دادن تغییرات',
    }).then((ok) => {
      if (ok) setDrafts(new Map());
      return ok;
    });
  useUnsavedGuard(dirty.length > 0, confirmLeave);

  // W23 review fix (#10): `beforeunload` only ever covered leaving the TAB.
  // Clicking the admin sidebar (a same-app <Link>) is client-side navigation
  // — no unload event fires, so unsaved edits vanished with zero warning the
  // moment an operator clicked away to check something. A capture-phase
  // click listener intercepts any internal <a> navigation while dirty.
  useEffect(() => {
    if (dirty.length === 0) return;
    const handler = (e: MouseEvent) => {
      // Ctrl/Cmd/Shift-click and middle-click are "open in a new tab/window"
      // — hijacking those would both break that browser-native behavior AND
      // navigate the CURRENT tab on confirm, losing the very drafts the
      // operator was trying to keep by opening elsewhere.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same-page hash jumps (e.g. the admin shell's «پرش به محتوای پنل»
      // skip-link) must never be treated as "leaving the page" — only the
      // path/query identify a different page.
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmLeave().then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty.length, router]);

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
    // `allRows`, not the filtered `rows` — a search term or «فقط کهنه‌ها»
    // left on from browsing shouldn't silently drop otherwise-matching
    // pasted lines out of the category as "unmatched".
    const { matched, unmatched } = matchPastedPrices(pasteText, allRows);
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

  // Bulk %-adjustment: shifts every CURRENTLY VISIBLE row (respecting the
  // search box and «فقط کهنه‌ها») by a percentage — a factory-wide price
  // bump/cut used to mean re-typing every row by hand. Only fills drafts
  // (nothing is saved until «ذخیره»), so it's as reversible as any other
  // edit via «انصراف». Stale-hidden rows have no real baseline (their price
  // is the `0` withheld-sentinel) and are skipped — `bulkTargetCount` is
  // what the toolbar button's own count should say, not `rows.length`.
  const bulkTargetCount = useMemo(() => rows.filter((r) => !r.current.priceHidden).length, [rows]);
  const applyBulkPct = () => {
    const pct = Number(normalizeDigits(bulkPct));
    if (!Number.isFinite(pct) || pct === 0) {
      toast.error('درصد نامعتبر است.');
      return;
    }
    const targets = rows.filter((r) => !r.current.priceHidden);
    if (targets.length === 0) {
      toast.error('کالایی برای اعمال درصد در این نما نیست.');
      return;
    }
    // Review fix: report how many rows actually got a new draft, not
    // `targets.length` — a row with an existing unparseable draft price is
    // skipped below, and the toast/button count shouldn't claim otherwise.
    let applied = 0;
    setDrafts((prev) => {
      const next = new Map(prev);
      for (const r of targets) {
        const base = prev.get(r.id)?.price !== undefined ? Number(normalizeDigits(prev.get(r.id)!.price!)) : r.current.price;
        if (!Number.isFinite(base) || base <= 0) continue;
        const price = String(Math.round(base * (1 + pct / 100)));
        next.set(r.id, { ...next.get(r.id), price });
        applied++;
      }
      return next;
    });
    toast.success(`${toPersianDigits(applied)} قیمت ${pct > 0 ? '+' : ''}${toPersianDigits(pct)}٪ تغییر کرد. بررسی و ذخیره کنید.`);
    setBulkPct('');
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
        <input
          className={ui.textCell}
          style={{ inlineSize: '12rem' }}
          placeholder="جستجو در نام/اسلاگ/سایز…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="جستجوی کالا"
        />
        <span className={ui.muted}>{toPersianDigits(rows.length)} کالا</span>
        <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)} disabled={rows.length === 0}>
          چسباندن قیمت‌ها
        </Button>
        <div className={ui.toolbar} role="group" aria-label="اعمال درصد روی نمای فعلی">
          <input
            className={ui.numInput}
            style={{ inlineSize: '5.5rem' }}
            inputMode="numeric"
            placeholder="٪ مثلاً ۲ یا ۲-"
            value={bulkPct}
            onChange={(e) => setBulkPct(e.target.value)}
            aria-label="درصد تغییر قیمت روی ردیف‌های نمایش‌داده‌شده"
          />
          <Button size="sm" variant="ghost" onClick={applyBulkPct} disabled={bulkTargetCount === 0 || !bulkPct.trim()}>
            اعمال روی {toPersianDigits(bulkTargetCount)} ردیف
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری جدول قیمت ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 && allRows.length === 0 ? (
        <EmptyState size="section" headline="کالایی در این دسته نیست" body="از بخش کاتالوگ کالا اضافه کنید." />
      ) : rows.length === 0 ? (
        <EmptyState
          size="section"
          headline="با این فیلتر کالایی پیدا نشد"
          body="جستجو یا «فقط کهنه‌ها» را پاک کنید."
          primary={{
            label: 'پاک‌کردن فیلترها',
            onClick: () => {
              setQ('');
              setOnlyStale(false);
            },
          }}
        />
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
                const saveError = rowErrors.get(r.id);
                // Fat-finger guard: only meaningful when the draft price
                // actually parses AND the row has a real (non-hidden)
                // baseline to compare against — a hidden row's `price` is
                // the `0` withheld-sentinel, which would read as a ±∞% move.
                const baseline = !r.current.priceHidden && r.current.price > 0 ? r.current.price : null;
                const movePct =
                  !isInvalidPrice && draftPrice !== undefined && baseline
                    ? (Math.abs(draftPrice - baseline) / baseline) * 100
                    : 0;
                const isFatFinger = movePct >= FAT_FINGER_THRESHOLD_PCT;
                const priceErrId = `price-err-${r.id}`;
                const priceWarnId = `price-warn-${r.id}`;
                const rowClass = isInvalidPrice
                  ? ui.rowInvalid
                  : saveError
                    ? ui.rowInvalid
                    : isFatFinger
                      ? ui.rowWarn
                      : isDirty
                        ? ui.rowDirty
                        : undefined;
                return (
                  <tr key={r.id} className={rowClass}>
                    <td>
                      {r.name}
                      {isDirty ? <span className="visually-hidden"> (ویرایش نشده، ذخیره نشده)</span> : null}
                    </td>
                    <td className="tnum">{r.size ?? '—'}</td>
                    <td>{r.factory ?? '—'}</td>
                    <td>
                      <PriceCell
                        row={i}
                        value={d?.price ?? String(r.current.price || '')}
                        onChange={(raw) => setDraft(r.id, { price: raw })}
                        ariaInvalid={isInvalidPrice}
                        ariaDescribedby={isInvalidPrice ? priceErrId : isFatFinger ? priceWarnId : undefined}
                        ariaLabel={`قیمت ${r.name}`}
                        onKeyDown={(e) => handleCellKeyDown(e, i, 'price')}
                      />
                      {isInvalidPrice ? (
                        <div id={priceErrId} className={ui.tileHint}>
                          عدد نامعتبر — ذخیره نمی‌شود
                        </div>
                      ) : isFatFinger ? (
                        <div id={priceWarnId} className={ui.tileHintWarn}>
                          {toPersianDigits(Math.round(movePct))}٪ تغییر نسبت به قیمت قبلی
                        </div>
                      ) : null}
                      {saveError ? <div className={ui.tileHintError}>{saveError}</div> : null}
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
