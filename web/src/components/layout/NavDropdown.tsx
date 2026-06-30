'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon } from '@/components/primitives/icons';
import styles from './Header.module.css';

/**
 * Reusable header dropdown / mega-menu shell. Opens on hover, focus, and click;
 * closes on outside-click, Esc, route change, and focus leaving the group. The
 * panel content is provided as children, so the same shell serves the simple
 * «ابزارها/خدمات/شرکت» menus and the wide «محصولات» mega-menu.
 */
export function NavDropdown({
  label,
  children,
  mega = false,
  active = false,
}: {
  label: string;
  children: ReactNode;
  mega?: boolean;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pathname = usePathname();

  // Close when navigating.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      className={mega ? styles.megaGroup : styles.navGroup}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.navTrigger}
        data-active={active ? '' : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={openNow}
      >
        {label}
        <ChevronDownIcon size={16} className={styles.caret} />
      </button>
      {open && (
        <div
          className={mega ? styles.mega : styles.dropdown}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          {children}
        </div>
      )}
    </div>
  );
}
