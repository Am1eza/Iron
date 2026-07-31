'use client';
/**
 * Admin command palette (US-24.4, extended W26) — Cmd/Ctrl-K to jump anywhere
 * in the panel: first the admin sections themselves, then the actual records
 * (سرنخ / کالا / مقاله / کاربر) matching what was typed.
 *
 * Deliberately hand-rolled rather than delegated to a palette library. The
 * correct ARIA combobox wiring, the keyboard model and the mouse-hover sync
 * are all here already — and, decisively, so is `checkUnsavedGuard()` below.
 * Every result, nav or entity, is nothing but an `{href}` handed to `go()`,
 * so there is exactly ONE navigation path and nothing can bypass that guard.
 *
 * Results are ONE FLAT ARRAY on purpose: `activeIndex` and
 * `aria-activedescendant` index into it directly. Group headings render as
 * `role="presentation"` rows that consume no index — a heading that could be
 * "selected" is both an ARIA lie and an Enter that navigates nowhere.
 *
 * Entity rows are scoped per type SERVER-side (lib/auth/adminSearch.ts); this
 * component renders whatever comes back and never filters by role itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type AdminSearchHit } from '@/lib/api/resources/admin';
import { checkUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import styles from './CommandPalette.module.css';

type NavItem = { href: string; label: string };

type ResultKind = 'nav' | AdminSearchHit['kind'];
type Result = { kind: ResultKind; href: string; label: string; sublabel?: string };

/** Shown above each group. The nav group is headed too, but only once entity
 *  rows exist — a nav-only palette looks exactly as it always did. */
const GROUP_LABEL: Record<ResultKind, string> = {
  nav: 'بخش‌های پنل',
  lead: 'سرنخ‌ها',
  sku: 'کالاها',
  article: 'مقاله‌ها',
  user: 'کاربران',
};

/** Matches the server's floor for fanning out to the entity queries. */
const MIN_SEARCH_LEN = 2;
const DEBOUNCE_MS = 250;
/** Stable identity — `?? []` inline would hand the memo below a fresh array
 *  every render and re-run the activeIndex reset on each one. */
const NO_HITS: AdminSearchHit[] = [];

export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Same debounce idiom as CatalogManager's search box — one request per
  // pause, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const canSearch = open && debouncedQ.length >= MIN_SEARCH_LEN;
  const search = useQuery({
    queryKey: ['admin', 'search', debouncedQ],
    // `signal` is react-query's own — when closing the palette flips `enabled`
    // off and drops the observer, the fetch is aborted rather than left to
    // land in a UI that is no longer on screen.
    queryFn: ({ signal }) => adminApi.search(debouncedQ, signal),
    enabled: canSearch,
    staleTime: 30_000,
  });

  const navResults = useMemo<Result[]>(() => {
    const q = query.trim();
    const items = q ? nav.filter((item) => item.label.includes(q) || item.href.includes(q)) : nav;
    return items.map((item) => ({ kind: 'nav' as const, href: item.href, label: item.label }));
  }, [nav, query]);

  // `canSearch` gates the READ as well as the fetch: a response that resolved
  // for a query the user has since cleared (or a palette they closed) must
  // never resurface.
  const entityResults = useMemo<AdminSearchHit[]>(
    () => (canSearch ? (search.data?.results ?? NO_HITS) : NO_HITS),
    [canSearch, search.data],
  );

  const results = useMemo<Result[]>(() => [...navResults, ...entityResults], [navResults, entityResults]);

  // Rows to paint: headings interleaved with items, where `index` is the
  // item's position in `results` — headings carry none.
  const rows = useMemo(() => {
    const showHeadings = results.some((r) => r.kind !== 'nav');
    const out: Array<{ heading: ResultKind } | { index: number; item: Result }> = [];
    let prev: ResultKind | null = null;
    results.forEach((item, index) => {
      if (showHeadings && item.kind !== prev) out.push({ heading: item.kind });
      prev = item.kind;
      out.push({ index, item });
    });
    return out;
  }, [results]);

  const close = () => {
    setOpen(false);
    setQuery('');
    // Clear the debounced term too, so the query is disabled the instant the
    // palette closes rather than DEBOUNCE_MS later.
    setDebouncedQ('');
    setActiveIndex(0);
  };

  // W23 review fix: this is a page-level router.push, not an <a> click — the
  // pricing grid's own unsaved-edits guard (a click-interceptor) never saw
  // it, so Cmd/Ctrl-K jumping away mid-edit lost drafts with zero warning.
  const go = (item: Result | undefined) => {
    if (!item) return;
    void checkUnsavedGuard().then((ok) => {
      if (!ok) return;
      router.push(item.href);
      close();
    });
  };

  // Global shortcut: Cmd/Ctrl-K opens it from anywhere in the admin panel; Esc closes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Reset on the RESULTS, not on the query. Entity rows arrive asynchronously
  // and get appended, so a reset keyed on `query` alone left `activeIndex`
  // pointing at whatever row slid under it when the response landed — Enter
  // then opened something the user never highlighted. Keyed on a content
  // signature rather than array identity so a re-render that merely rebuilds
  // an equal list doesn't yank the selection back to the top mid-arrowing.
  const resultsKey = results.map((r) => `${r.kind}:${r.href}`).join('|');
  useEffect(() => {
    setActiveIndex(0);
  }, [resultsKey]);

  const showLoading = canSearch && search.isFetching;

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        جستجو در پنل
        <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={styles.root} role="presentation" onClick={close}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="جستجو و جهش سریع در پنل"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در پنل… (بخش، نام، شمارهٔ موبایل، اسلاگ)"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-list"
              aria-activedescendant={results[activeIndex] ? `cmdk-${activeIndex}` : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[activeIndex]);
                }
              }}
            />
            <ul id="command-palette-list" role="listbox" className={styles.list}>
              {results.length === 0 && !showLoading ? <li className={styles.empty}>چیزی پیدا نشد.</li> : null}
              {rows.map((row) =>
                'heading' in row ? (
                  <li key={`h-${row.heading}`} role="presentation" className={styles.groupHeading}>
                    {GROUP_LABEL[row.heading]}
                  </li>
                ) : (
                  <li
                    key={`${row.item.kind}-${row.index}-${row.item.href}`}
                    id={`cmdk-${row.index}`}
                    role="option"
                    aria-selected={row.index === activeIndex}
                  >
                    <button
                      type="button"
                      className={styles.item}
                      data-active={row.index === activeIndex ? '' : undefined}
                      onMouseEnter={() => setActiveIndex(row.index)}
                      onClick={() => go(row.item)}
                    >
                      <span className={styles.itemLabel}>{row.item.label}</span>
                      {row.item.sublabel ? <span className={styles.itemSub}>{row.item.sublabel}</span> : null}
                    </button>
                  </li>
                ),
              )}
              {/* Sits BELOW the nav rows rather than replacing them, so the
                  palette never blanks out between keystrokes. `presentation`,
                  so it consumes no index and is never activedescendant. */}
              {showLoading ? (
                <li role="presentation" className={styles.loading}>
                  در حال جستجو…
                </li>
              ) : null}
            </ul>
            <div className={styles.hint}>
              <kbd>↑</kbd>
              <kbd>↓</kbd> جابه‌جایی · <kbd>Enter</kbd> رفتن · <kbd>Esc</kbd> بستن
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
