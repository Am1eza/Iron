'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon } from '@/components/primitives/icons';
import styles from './Header.module.css';

/**
 * Reusable header dropdown / mega-menu shell. Opens on hover (mouse) and on
 * click / Enter / Space (keyboard, via the trigger's native button click) —
 * deliberately NOT on mere Tab-focus, so a keyboard user tabbing past the
 * trigger to reach the rest of the page isn't forced through the entire
 * panel first. Closes on outside-click, Esc (which also returns focus to the
 * trigger), route change, and focus leaving the group. The panel content is
 * provided as children, so the same shell serves the simple
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
      // Return focus to the trigger — otherwise closing the panel from deep
      // inside the mega-menu drops keyboard focus to <body>, stranding the user.
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
        ref={triggerRef}
        type="button"
        className={styles.navTrigger}
        data-active={active ? '' : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
