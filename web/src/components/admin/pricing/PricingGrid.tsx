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
import { PRICE_REVIEW_AFTER_DAYS, priceAgeDays } from '@/lib/utils/priceAge';
import { sizeLabel } from '@/lib/utils/catalogLabels';
import { useToast } from '@/lib/hooks/useToast';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { ApiError } from '@/lib/api/errors';
import { Alert, Badge, Button, Chip, EmptyState, Modal, MovementBadge, TableSkeleton, useConfirm } from '@/components/ui';
import { Sparkline } from '../dashboard/Sparkline';
import { PriceHistoryChart } from '../charts/PriceHistoryChart';
import ui from '../adminUi.module.css';

/** Drilldown ranges, in the order an operator scans them. Must stay a subset
 *  of the repo's RANGE_DAYS (catalogRepo.ts) — the route validates against it
 *  and silently falls back to 90d for anything else. */
const HISTORY_RANGES: Array<{ id: string; label: string }> = [
  { id: '7d', label: '۷ روز' },
  { id: '30d', label: '۳۰ روز' },
  { id: '90d', label: '۹۰ روز' },
  { id: '1y', label: '۱ سال' },
];

/** A same-day price move this big is almost always a fat-fingered digit, not
 *  a real market swing — steel prices just don't jump this fast. Doesn't
 *  block saving (it might be genuinely right), just flags the row so the
 *  operator glances twice before hitting «ذخیره». */
const FAT_FINGER_THRESHOLD_PCT = 20;

/**
 * Parse the bulk %-adjust box, tolerating how a minus sign actually lands in
 * an RTL field.
 *
 * `Number(normalizeDigits(x))` alone rejected «۲-» — which is precisely what
 * this input's own placeholder («٪ مثلاً ۲ یا ۲-») tells the operator to type,
 * and what you get typing the digit before the sign in an RTL box. The screen
 * answered its own worked example with «درصد نامعتبر است». Also accepts the
 * real minus U+2212 and «٪», which come along for the ride from a paste.
 */
export function parseBulkPct(input: string): number | null {
  const s = normalizeDigits(input).replace(/[−–—]/g, '-').replace(/[٪%\s,،]/g, '');
  // A trailing sign is the RTL case; a leading one is the ordinary case.
  const normalized = /^\d+(\.\d+)?[-+]$/.test(s) ? s.slice(-1) + s.slice(0, -1) : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

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
  // The grid is scoped to one category and optionally one sub-category, so its
  // `size` column can use «ضخامت» for ورق and «ارتفاع» for پروفیل Z without
  // leaking either word into a mixed profile list.
  const sizeCol = sizeLabel(cat, sub || null);
  const [onlyStale, setOnlyStale] = useState(params.get('stale') === '1');
  // ?unpriced=1 → the same deep-link for the «کالای بدون قیمت» tile. A
  // never-priced product is not a stale one — it has no `current_prices` row
  // for «فقط کهنه‌ها» to find — so it needs its own filter to be reachable.
  const [onlyUnpriced, setOnlyUnpriced] = useState(params.get('unpriced') === '1');
  // ?review=1 → the deep-link for the «نیازمند بازبینی» summary and the
  // dashboard tile. Distinct from ?stale=1 on purpose: «کهنه» means "not
  // priced today" and matches most of the catalogue most mornings, while this
  // is the far smaller set nothing has touched in a working week. See
  // `lib/utils/priceAge.ts` for why the two thresholds are kept apart.
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(params.get('review') === '1');
  // Age is the one column worth ordering by — «what has been sitting longest»
  // is the question this screen exists to answer, and scanning a date column
  // for it by eye across 180 میلگرد rows is not an answer. `null` keeps the
  // catalogue's own order, which is what an operator pricing a whole category
  // top-to-bottom wants.
  const [ageSort, setAgeSort] = useState<'desc' | 'asc' | null>(null);
  const [q, setQ] = useState('');
  const [bulkPct, setBulkPct] = useState('');
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  // Per-SKU price-history drilldown. The row sparkline used to be
  // `aria-hidden` decoration reachable by nobody — it is now the button that
  // opens the full series.
  const [historyFor, setHistoryFor] = useState<{ slug: string; name: string } | null>(null);
  const [historyRange, setHistoryRange] = useState('90d');
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
  const categories = [...(catData?.categories ?? [])].sort((a, b) => a.order - b.order);

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
  /**
   * Age in whole days per row, and the set that has crossed the review
   * threshold.
   *
   * `now` is pinned to the moment this batch of rows arrived rather than read
   * fresh on every render: an age recomputed mid-keystroke can tick a row over
   * the threshold while the operator is typing in it, moving the row under
   * their cursor if the age sort is on.
   */
  const ageByRow = useMemo(() => {
    const now = new Date();
    return new Map(allRows.map((r) => [r.id, priceAgeDays(r.current.updatedAt, now)]));
  }, [allRows]);
  /** Catalogue-wide, not just this category — an operator who has «میلگرد»
   *  selected must still be told that 45 لوله مسی rows have gone untouched,
   *  because those are exactly the rows nobody navigates to. */
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminApi.stats,
    staleTime: 60 * 1000,
  });
  const reviewTotal = statsData?.stats.pricesNeedingReview ?? 0;
  /** Ids of rows with no `current_prices` row at all. Server-supplied: the
   *  admin DTO renders an absent price and a stale-HIDDEN one identically, so
   *  the grid cannot tell them apart from `rows` alone. */
  const unpricedIds = useMemo(() => new Set(data?.withoutPrice ?? []), [data]);
  /**
   * Rows past the review threshold — priced once and then left alone.
   *
   * `unpricedIds` is excluded, and the exclusion is load-bearing rather than
   * tidy: a product with no `current_prices` row still arrives with an
   * `updatedAt` (the admin DTO's default), so on production the very first
   * render of this filter offered «میلگرد آجدار ۱۲ آناهیتا گیلان» — a SKU
   * nobody has ever priced — as a price that had gone stale. Never-priced is
   * already its own queue («فقط بدون قیمت»), with its own explanation of why
   * the mirror declines to guess; folding the two together would bury the
   * distinction that makes each of them actionable.
   */
  const needsReviewIds = useMemo(
    () =>
      new Set(
        allRows
          .filter((r) => !unpricedIds.has(r.id) && (ageByRow.get(r.id) ?? 0) >= PRICE_REVIEW_AFTER_DAYS)
          .map((r) => r.id),
      ),
    [allRows, ageByRow, unpricedIds],
  );
  const rows = useMemo(() => {
    let out = onlyStale ? allRows.filter((r) => r.current.isStale) : allRows;
    if (onlyUnpriced) out = out.filter((r) => unpricedIds.has(r.id));
    if (onlyNeedsReview) out = out.filter((r) => needsReviewIds.has(r.id));
    const nq = normalizeDigits(q).trim().toLowerCase();
    if (nq) {
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(nq) ||
          r.slug.toLowerCase().includes(nq) ||
          (r.size ?? '').toLowerCase().includes(nq),
      );
    }
    if (ageSort) {
      // Copy before sorting: `out` is still `allRows` itself whenever no
      // filter narrowed it, and sorting in place would reorder the memoized
      // source array that `dirty`, the paste matcher and the sparkline batch
      // all read from.
      const dir = ageSort === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => ((ageByRow.get(a.id) ?? 0) - (ageByRow.get(b.id) ?? 0)) * dir);
    }
    return out;
  }, [allRows, onlyStale, onlyUnpriced, unpricedIds, onlyNeedsReview, needsReviewIds, q, ageSort, ageByRow]);

  // Live sub-category list for the selected category — NOT the static
  // MOCK_CATEGORY_SUBS fixture (which silently misses/mismatches anything an admin
  // created via the catalog CRUD; the category list above was already live).
  const catId = categories.find((c) => c.slug === cat)?.id;
  const { data: subData } = useQuery({
    queryKey: ['admin', 'subcategories', catId],
    queryFn: () => adminApi.subCategories(catId),
    enabled: Boolean(catId),
    staleTime: 5 * 60 * 1000,
  });
  const subs = [...(subData?.subCategories ?? [])].sort((a, b) => a.order - b.order);

  // One batched request for every visible row's sparkline series.
  const slugsKey = useMemo(() => allRows.map((r) => r.slug).sort().join(','), [allRows]);
  const { data: historyData } = useQuery({
    queryKey: ['admin', 'sku-history-batch', slugsKey],
    queryFn: () => adminApi.skuHistoryBatch(allRows.map((r) => r.slug)),
    enabled: allRows.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const seriesBySlug = historyData?.series;

  // Drilldown series — admin-gated and `no-store`, unlike the public
  // sku-history endpoint the sparklines are happy with. Fetched only while
  // the modal is open, refetched per range.
  const {
    data: drilldown,
    isLoading: drilldownLoading,
    isError: drilldownError,
    refetch: refetchDrilldown,
  } = useQuery({
    queryKey: ['admin', 'pricing', 'history', historyFor?.slug ?? '', historyRange],
    queryFn: () => adminApi.skuHistoryAdmin(historyFor!.slug, historyRange),
    enabled: Boolean(historyFor),
  });

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
      // A row still has to carry a positive price to be saveable (the write
      // path rejects anything else) — but a delivery-time-only edit on a
      // not-yet-priced product used to be dropped here in complete silence:
      // no dirty highlight, no row error, no mention in the save bar. It is
      // now surfaced as `deliveryBlocked` below.
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
      body: `${toPersianDigits(dirty.length)} قیمت ذخیره‌نشده دارید. با تغییر فیلتر از بین می‌رود — ادامه می‌دهید؟`,
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
      toast.error(`هیچ ردیفی تطبیق نخورد. کلید هر خط باید با نام، اسلاگ یا ${sizeCol} یکی از کالاهای این دسته بخواند.`);
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
  // edit via «انصراف».
  //
  // The target test is `price > 0`, NOT `!priceHidden`. Hidden used to imply
  // a `0` withheld-sentinel, so skipping those rows was right — but the admin
  // read no longer withholds, and once every price in the catalog aged past
  // the hide threshold (which is where production actually was) that test
  // matched EVERY row and disabled the feature outright: «اعمال روی ۰ ردیف».
  // A row with genuinely no price yet still has nothing to scale.
  const bulkTargetCount = useMemo(() => rows.filter((r) => r.current.price > 0).length, [rows]);
  const applyBulkPct = () => {
    const pct = parseBulkPct(bulkPct);
    if (pct === null) {
      toast.error('درصد نامعتبر است. مثلاً ۲ برای افزایش و -۲ برای کاهش.');
      return;
    }
    const targets = rows.filter((r) => r.current.price > 0);
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
        {needsReviewIds.size > 0 ? (
          <Chip selected={onlyNeedsReview} onClick={() => setOnlyNeedsReview((v) => !v)}>
            نیازمند بازبینی ({toPersianDigits(needsReviewIds.size)})
          </Chip>
        ) : null}
        <Chip selected={onlyStale} onClick={() => setOnlyStale((v) => !v)}>
          فقط کهنه‌ها{staleCount > 0 ? ` (${toPersianDigits(staleCount)})` : ''}
        </Chip>
        {unpricedIds.size > 0 ? (
          <Chip selected={onlyUnpriced} onClick={() => setOnlyUnpriced((v) => !v)}>
            فقط بدون قیمت ({toPersianDigits(unpricedIds.size)})
          </Chip>
        ) : null}
        <input
          className={ui.textCell}
          style={{ inlineSize: '12rem' }}
          placeholder={`جستجو در نام/اسلاگ/${sizeCol}…`}
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
            placeholder="٪ مثلاً ۲ یا -۲"
            value={bulkPct}
            onChange={(e) => setBulkPct(e.target.value)}
            aria-label="درصد تغییر قیمت روی ردیف‌های نمایش‌داده‌شده"
          />
          <Button size="sm" variant="ghost" onClick={applyBulkPct} disabled={bulkTargetCount === 0 || !bulkPct.trim()}>
            اعمال روی {toPersianDigits(bulkTargetCount)} ردیف
          </Button>
        </div>
      </div>

      {/* The catalogue-wide review queue. Deliberately ABOVE the per-category
          notices and independent of the selected category: the lines that go
          untouched longest (لوله مسی on a per-coil basis, تسمه مسی, ساندویچ
          پانل) are structurally un-mirrorable, so nothing will ever refresh
          them on its own and nobody navigates to them to notice. */}
      {reviewTotal > 0 ? (
        <Alert tone="warning">
          ‏{toPersianDigits(reviewTotal)} قیمت در کل کاتالوگ بیش از {toPersianDigits(PRICE_REVIEW_AFTER_DAYS)} روز
          است به‌روز نشده و باید دستی بررسی شود؛ همگام‌سازی خودکار به این کالاها نمی‌رسد.
          {needsReviewIds.size > 0 ? (
            <>
              {' '}
              <button type="button" className={ui.linkButton} onClick={() => setOnlyNeedsReview(true)}>
                ‏{toPersianDigits(needsReviewIds.size)} مورد در این دسته را نشان بده
              </button>
            </>
          ) : (
            ' در این دسته موردی نیست؛ دسته را عوض کنید.'
          )}
        </Alert>
      ) : null}

      {unpricedIds.size > 0 ? (
        <Alert tone="warning">
          ‏{toPersianDigits(unpricedIds.size)} کالای فعال این دسته هیچ قیمتی ندارد و روی سایت با «تماس بگیرید»
          نمایش داده می‌شود. همگام‌سازی خودکار عمداً برایشان قیمت نمی‌گذارد، چون تنها ردیف هم‌سایزِ منبع مربوط به
          کارخانهٔ دیگری است.{' '}
          <button type="button" className={ui.linkButton} onClick={() => setOnlyUnpriced(true)}>
            فقط همین‌ها را نشان بده
          </button>
        </Alert>
      ) : null}

      {isLoading ? (
        <TableSkeleton rows={8} cols={9} />
      ) : isError ? (
        <EmptyState
          size="section"
          tone="error"
          headline="بارگذاری جدول قیمت ناموفق بود."
          primary={{ label: 'تلاش دوباره', onClick: () => void refetch() }}
        />
      ) : rows.length === 0 && allRows.length === 0 ? (
        // This used to have a second branch for products stranded under a
        // retired sub-category — 40 of «پروفیل»'s were, and the empty state
        // told the operator to go and add products, i.e. to duplicate the
        // ones already there. A product can no longer be missing from this
        // table while existing in the catalog, so the honest empty state is
        // the only one left.
        <EmptyState size="section" headline="کالایی در این دسته نیست" body="از بخش کاتالوگ کالا اضافه کنید." />
      ) : rows.length === 0 ? (
        <EmptyState
          size="section"
          headline="با این فیلتر کالایی پیدا نشد"
          body="جستجو یا فیلترهای «نیازمند بازبینی» / «فقط کهنه‌ها» را پاک کنید."
          primary={{
            label: 'پاک‌کردن فیلترها',
            onClick: () => {
              setQ('');
              setOnlyStale(false);
              // Was left set, so «پاک‌کردن فیلترها» could land the operator
              // back on the same empty table it was offered from.
              setOnlyUnpriced(false);
              setOnlyNeedsReview(false);
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
                <th scope="col">{sizeCol}</th>
                <th scope="col">کارخانه</th>
                <th scope="col">قیمت (تومان)</th>
                <th scope="col">زمان تحویل</th>
                <th scope="col">نوسان</th>
                <th scope="col">روند ۳۰روزه</th>
                {/* Tri-state, cycling oldest → newest → catalogue order, so
                    the operator can always get back to the order they price
                    a category in. `aria-sort` on the <th> is what a screen
                    reader announces; the button carries the action. */}
                <th
                  scope="col"
                  aria-sort={ageSort === 'desc' ? 'descending' : ageSort === 'asc' ? 'ascending' : 'none'}
                >
                  <button
                    type="button"
                    className={ui.sortButton}
                    onClick={() => setAgeSort((v) => (v === null ? 'desc' : v === 'desc' ? 'asc' : null))}
                  >
                    عمر قیمت
                    <span aria-hidden="true">{ageSort === 'desc' ? ' ↓' : ageSort === 'asc' ? ' ↑' : ' ⇅'}</span>
                    <span className="visually-hidden">
                      {ageSort === 'desc'
                        ? ' — مرتب‌شده از قدیمی‌ترین؛ برای مرتب‌سازی از تازه‌ترین فعال کنید'
                        : ageSort === 'asc'
                          ? ' — مرتب‌شده از تازه‌ترین؛ برای بازگشت به ترتیب کاتالوگ فعال کنید'
                          : ' — برای مرتب‌سازی از قدیمی‌ترین فعال کنید'}
                    </span>
                  </button>
                </th>
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
                // A delivery-time edit on a row that has no saveable price is
                // excluded from `dirty` — say so instead of eating it.
                const effectivePrice = draftPrice ?? r.current.price;
                const deliveryBlocked =
                  d?.deliveryTime !== undefined &&
                  d.deliveryTime !== r.current.deliveryTime &&
                  !(Number.isFinite(effectivePrice) && effectivePrice > 0);
                // Fat-finger guard: only meaningful when the draft price
                // actually parses AND the row has a real baseline to compare
                // against. `price > 0` is the whole test — a stale-hidden
                // row now carries its real previous price (see the admin
                // read), and excluding it here meant the guard was off for
                // exactly the rows most likely to be retyped from scratch.
                const baseline = r.current.price > 0 ? r.current.price : null;
                const movePct =
                  !isInvalidPrice && draftPrice !== undefined && baseline
                    ? (Math.abs(draftPrice - baseline) / baseline) * 100
                    : 0;
                const isFatFinger = movePct >= FAT_FINGER_THRESHOLD_PCT;
                const age = ageByRow.get(r.id) ?? 0;
                const needsReview = needsReviewIds.has(r.id);
                const priceErrId = `price-err-${r.id}`;
                const priceWarnId = `price-warn-${r.id}`;
                const deliveryErrId = `delivery-err-${r.id}`;
                const rowClass = isInvalidPrice
                  ? ui.rowInvalid
                  : saveError
                    ? ui.rowInvalid
                    : isFatFinger
                      ? ui.rowWarn
                      : isDirty
                        ? ui.rowDirty
                        : // Ranked BELOW every edit state on purpose: age is a
                          // standing condition, and it must never paint over
                          // the feedback for what the operator just typed.
                          needsReview
                          ? ui.rowAged
                          : undefined;
                return (
                  <tr key={r.id} className={rowClass}>
                    <td>
                      {r.name}
                      {isDirty ? <span className="visually-hidden"> (ویرایش نشده، ذخیره نشده)</span> : null}
                    </td>
                    <td className="tnum">{r.size ? toPersianDigits(r.size) : '—'}</td>
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
                        aria-invalid={deliveryBlocked || undefined}
                        aria-describedby={deliveryBlocked ? deliveryErrId : undefined}
                      />
                      {deliveryBlocked ? (
                        <div id={deliveryErrId} className={ui.tileHintWarn}>
                          اول قیمت این کالا را وارد کنید — زمان تحویل به‌تنهایی ذخیره نمی‌شود.
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {r.current.movementPct != null ? (
                        <MovementBadge dir={r.current.movementDir} pct={r.current.movementPct} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={ui.sparkButton}
                        aria-label={`تاریخچهٔ قیمت ${r.name}`}
                        onClick={() => {
                          setHistoryRange('90d');
                          setHistoryFor({ slug: r.slug, name: r.name });
                        }}
                      >
                        <RowSparkline series={seriesBySlug?.[r.slug]} />
                      </button>
                    </td>
                    <td className="tnum">
                      {/* A never-priced row has no age to report: its
                          `updatedAt` is whatever the DTO defaults to, and
                          «۰ روز» there would read as "priced today", which is
                          the opposite of the truth. */}
                      {unpricedIds.has(r.id) ? (
                        <span className={ui.muted}>—</span>
                      ) : needsReview ? (
                        <Badge tone="loss">{toPersianDigits(age)} روز</Badge>
                      ) : (
                        <span>{age === 0 ? 'امروز' : `${toPersianDigits(age)} روز`}</span>
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
          هر خط: «نام، اسلاگ یا {sizeCol} کالا» و سپس قیمت (جداشده با Tab، کاما یا فاصله). فقط جدول پر می‌شود؛
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
      {/* Per-SKU drilldown. Modal locks body scroll while open — that is
          harmless for the sticky save bar above, which is `position: sticky`
          INSIDE the (now non-scrolling) page flow, not a fixed overlay: it
          simply stays where it was rendered, and the Modal's own scrim sits
          above it. Nothing about the save state is touched by opening this. */}
      <Modal
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={`تاریخچهٔ قیمت — ${historyFor?.name ?? ''}`}
      >
        <div className={ui.toolbar} role="group" aria-label="بازهٔ زمانی نمودار">
          {HISTORY_RANGES.map((r) => (
            <Chip key={r.id} selected={historyRange === r.id} onClick={() => setHistoryRange(r.id)}>
              {r.label}
            </Chip>
          ))}
        </div>
        {drilldownLoading ? (
          <TableSkeleton rows={4} cols={1} />
        ) : drilldownError ? (
          <EmptyState
            size="inline"
            tone="error"
            headline="بارگذاری تاریخچهٔ قیمت ناموفق بود."
            primary={{ label: 'تلاش دوباره', onClick: () => void refetchDrilldown() }}
          />
        ) : (
          <PriceHistoryChart points={drilldown?.points ?? []} range={historyRange} />
        )}
      </Modal>

      {dialog}
    </div>
  );
}
