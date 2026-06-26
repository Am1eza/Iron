'use client';
import { useRef } from 'react';
import styles from './Tabs.module.css';

export type TabItem = { id: string; label: string; count?: number };

/**
 * D6 · Tabs — underline tablist with roving arrow-key navigation. Controlled:
 * the parent owns `active` and renders the matching `role="tabpanel"`.
 */
export function Tabs({
  items,
  active,
  onChange,
  label,
  idBase = 'tab',
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  idBase?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL: Left = next
    if (dir === 0) {
      if (e.key === 'Home') refs.current[0]?.focus();
      if (e.key === 'End') refs.current[items.length - 1]?.focus();
      return;
    }
    e.preventDefault();
    const next = (index + dir + items.length) % items.length;
    refs.current[next]?.focus();
    const nextItem = items[next];
    if (nextItem) onChange(nextItem.id);
  };

  return (
    <div className={styles.tablist} role="tablist" aria-label={label}>
      {items.map((item, i) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idBase}-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            data-selected={selected ? '' : undefined}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className={`${styles.count} tnum`}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Panel wrapper that pairs with a Tabs item id. */
export function TabPanel({
  id,
  active,
  idBase = 'tab',
  children,
}: {
  id: string;
  active: string;
  idBase?: string;
  children: React.ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${id}`}
      aria-labelledby={`${idBase}-${id}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
