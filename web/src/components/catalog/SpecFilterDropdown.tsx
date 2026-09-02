'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip, CountBadge } from '@/components/ui';
import { toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import styles from './SpecFilterDropdown.module.css';

/**
 * One facet's filter control: a compact trigger button that opens a popover
 * checklist of that facet's values, instead of the old always-open chip wall
 * (every value of every facet on screen at once — the source of the ~2
 * mobile screens of scrolling before the first price row). Multi-select (OR)
 * lives inside the popover; PriceTable ANDs across different facets on top
 * of this, unchanged.
 *
 * Popover mechanics (outside-click close, Escape closes and refocuses the
 * trigger) mirror `CountrySelect`, but values stay `Chip` toggle buttons —
 * this is multi-select, not CountrySelect's single-select combobox/listbox.
 */
export function SpecFilterDropdown({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDoc);
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.clearTimeout(id);
    };
  }, [open, close]);

  // A search box above two or three chips (سایز/استاندارد) is more chrome
  // than the list it searches — «کارخانه»-sized facets (double digits of
  // values) are what this earns its keep for.
  const showSearch = values.length > 8;
  const q = normalizeDigits(query.trim()).toLowerCase();
  const visible = q
    ? values.filter((v) => normalizeDigits(v).toLowerCase().includes(q))
    : values;

  const count = selected.size;

  return (
    <div
      className={styles.root}
      ref={rootRef}
      // On the wrapper, not just the trigger/search input: once a value chip
      // inside the popup has focus (the normal state right after clicking
      // one), Escape must still close it — React's synthetic events bubble,
      // so one handler here covers every focusable descendant.
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <CountBadge count={count} label={`${toPersianDigits(count)} مقدار انتخاب‌شده در ${label}`} />
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className={styles.popup} role="group" aria-label={label}>
          {showSearch ? (
            <input
              ref={searchRef}
              type="text"
              className={styles.search}
              placeholder="جست‌وجو…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
          <div className={styles.chips}>
            {visible.length === 0 ? (
              <p className={styles.empty}>موردی یافت نشد</p>
            ) : (
              visible.map((v) => (
                <Chip
                  key={v}
                  variant="filter"
                  selected={selected.has(v)}
                  onClick={() => onToggle(v)}
                >
                  {toPersianDigits(v)}
                </Chip>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
