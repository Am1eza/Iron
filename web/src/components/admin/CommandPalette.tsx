'use client';
/**
 * Admin command palette (US-24.4) — Cmd/Ctrl-K to jump between admin
 * sections instantly instead of hunting through the top nav. Scoped to page
 * navigation: entity-level jump (a specific lead/SKU/user/order) would need
 * per-item admin routes that don't exist yet (leads/orders/users are all
 * list-only pages today) — adding those is a separate, larger change.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './CommandPalette.module.css';

type NavItem = { href: string; label: string };

export function CommandPalette({ nav }: { nav: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return nav;
    return nav.filter((item) => item.label.includes(q) || item.href.includes(q));
  }, [nav, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const go = (item: NavItem | undefined) => {
    if (!item) return;
    router.push(item.href);
    close();
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

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        جستجوی بخش‌ها
        <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={styles.root} role="presentation" onClick={close}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="جهش سریع بین بخش‌های پنل"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی بخش پنل… (مثلاً «سرنخ» یا «قیمت»)"
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
              {results.length === 0 ? (
                <li className={styles.empty}>چیزی پیدا نشد.</li>
              ) : (
                results.map((item, i) => (
                  <li key={item.href} id={`cmdk-${i}`} role="option" aria-selected={i === activeIndex}>
                    <button
                      type="button"
                      className={styles.item}
                      data-active={i === activeIndex ? '' : undefined}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => go(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))
              )}
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
