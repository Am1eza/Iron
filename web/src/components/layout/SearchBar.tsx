'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { routes } from '@/lib/routes';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { catalogApi } from '@/lib/api/resources/catalog';
import type { Article, PriceRow } from '@/lib/types/domain';
import { SearchIcon, CloseIcon } from '@/components/primitives/icons';
import styles from './SearchBar.module.css';

type Props = {
  size?: 'sm' | 'lg';
  autoFocus?: boolean;
  placeholder?: string;
  /** Visually-hidden label text for the input. */
  label?: string;
  /** Pre-fill (controlled) — the /search page passes the current ?q= so the
   *  field re-syncs when the user navigates between queries e.g. via a
   *  suggestion chip, without a full remount. */
  initial?: string;
};

type Suggestion = { key: string; label: string; meta?: string; href: string };

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;
const MAX_SKU_SUGGESTIONS = 5;
const MAX_ARTICLE_SUGGESTIONS = 3;
const NO_HITS: Suggestion[] = [];

function skuSuggestion(row: PriceRow): Suggestion {
  const meta = [row.factory, row.size ? `سایز ${toPersianDigits(row.size)}` : null].filter(Boolean).join(' · ');
  return {
    key: `sku:${row.id}`,
    label: row.name,
    meta: meta || undefined,
    href: routes.sku(row.categoryId, row.subCategoryId, row.slug),
  };
}

function articleSuggestion(a: Article): Suggestion {
  return {
    key: `article:${a.id}`,
    label: a.title,
    meta: a.type === 'news' ? 'خبر بازار' : 'مقاله',
    href: a.type === 'news' ? routes.news(a.slug) : routes.blog(a.slug),
  };
}

/**
 * N15 · Search as navigation. Submits to `/جستجو?q=` (digit-normalized so «۱۴» and
 * «14» both match). `lg` is the home/AI/search-page variant; `sm` is the header
 * utility variant.
 *
 * Suggestions reuse `catalogApi.search` → `/api/search`, the SAME endpoint
 * already backing the /search page itself (already rate-limited, already
 * returns distinguishable sku/article arrays) — same debounce idiom as the
 * admin command palette (`CommandPalette.tsx`). ARIA combobox pattern: the
 * input keeps real DOM focus, `aria-activedescendant` marks the virtually-
 * focused option, rather than moving focus into the list. Enter with no
 * suggestion highlighted still submits to /search — a network hiccup here
 * must never block the baseline "press Enter, get results" path.
 */
export function SearchBar({
  size = 'sm',
  autoFocus = false,
  placeholder = 'جستجوی محصول، سایز، کارخانه…',
  label = 'جستجو در آهن‌تایم',
  initial = '',
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState(initial);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  // Same debounce idiom as CommandPalette/CatalogManager's search boxes: one
  // request per pause in typing, not one per keystroke.
  useEffect(() => {
    const term = normalizeDigits(q).trim();
    const t = window.setTimeout(() => setDebouncedQ(term), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q]);

  const canSearch = debouncedQ.length >= MIN_QUERY_LEN;
  const search = useQuery({
    queryKey: ['search', 'suggest', debouncedQ],
    queryFn: ({ signal }) => catalogApi.search(debouncedQ, { signal }),
    enabled: canSearch,
    staleTime: 30_000,
  });

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!canSearch || !search.data) return NO_HITS;
    return [
      ...search.data.skus.slice(0, MAX_SKU_SUGGESTIONS).map(skuSuggestion),
      ...search.data.articles.slice(0, MAX_ARTICLE_SUGGESTIONS).map(articleSuggestion),
    ];
  }, [canSearch, search.data]);

  // Open/close and reset the highlighted row on new results, not on every
  // keystroke — a response for a query the visitor has since changed must
  // never pop the dropdown back open on top of what they're typing now.
  const suggestionsKey = suggestions.map((s) => s.key).join('|');
  useEffect(() => {
    setActiveIndex(-1);
    setOpen(suggestions.length > 0);
  }, [suggestionsKey, suggestions.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = normalizeDigits(q).trim();
    if (term.length === 0) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    router.push(routes.search(term));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      setOpen(false);
      router.push(suggestions[activeIndex]!.href);
    }
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <form
        role="search"
        className={`${styles.bar} ${size === 'lg' ? styles.lg : styles.sm}`}
        onSubmit={submit}
        data-event="search_use"
      >
        <SearchIcon className={styles.icon} size={size === 'lg' ? 22 : 18} />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          className={styles.input}
          placeholder={placeholder}
          aria-label={label}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(suggestions.length > 0)}
          autoFocus={autoFocus}
          enterKeyHint="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
        />
        {q.length > 0 && (
          <button
            type="button"
            className={styles.clear}
            aria-label="پاک کردن جستجو"
            onClick={() => {
              setQ('');
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={16} />
          </button>
        )}
        {size === 'lg' && (
          <button type="submit" className={styles.submit}>
            جستجو
          </button>
        )}
      </form>

      {open && suggestions.length > 0 ? (
        <ul id={listboxId} role="listbox" className={styles.suggestions} aria-label="پیشنهادهای جستجو">
          {suggestions.map((s, i) => (
            <li key={s.key} id={`${listboxId}-${i}`} role="option" aria-selected={i === activeIndex}>
              <Link
                href={s.href}
                className={styles.suggestion}
                data-active={i === activeIndex ? '' : undefined}
                tabIndex={-1}
                onClick={() => setOpen(false)}
                data-event="search_suggestion_click"
              >
                <span className={styles.suggestionLabel}>{s.label}</span>
                {s.meta ? <span className={styles.suggestionMeta}>{s.meta}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
