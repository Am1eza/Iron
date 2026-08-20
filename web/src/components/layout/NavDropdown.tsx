'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
 *
 * `keepMounted` renders the panel on every paint and only toggles the `hidden`
 * attribute, instead of mounting it on open. That is the difference between
 * "the catalog is a crawlable internal-link surface" and "the catalog does not
 * exist as far as any crawler or answer engine is concerned": the «محصولات»
 * panel is the site's densest set of internal links (~90 category and
 * sub-category URLs) and, mounted on open, not one of them ever reached the
 * HTML. `hidden` is the right toggle rather than a CSS class — it removes the
 * panel from the tab order and the accessibility tree exactly as unmounting
 * did, while leaving the anchors in the document for a parser to follow.
 * The simple dropdowns keep mounting on open: they duplicate links the footer
 * already publishes, so there is nothing to gain and a little DOM to lose.
 */
export function NavDropdown({
  label,
  children,
  mega = false,
  active = false,
  keepMounted = false,
  panelLabel,
}: {
  label: string;
  children: ReactNode;
  mega?: boolean;
  active?: boolean;
  keepMounted?: boolean;
  /** Accessible name for the panel itself, when it is a landmark worth naming. */
  panelLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  /**
   * "Held open by a click", as distinct from "showing because the pointer is
   * here". Without the distinction, a plain toggle on click was WRONG on every
   * pointer device: entering the trigger fires mouseenter, which opens the
   * panel, and the click that follows immediately toggled it shut again — so
   * anyone who clicks a menu rather than hovering it (the ordinary habit, and
   * the only gesture on a touch-capable laptop) saw it flash and vanish.
   * Hover shows it, a click pins it, a second click dismisses it, and leaving
   * with the pointer only closes what was never pinned.
   */
  const [pinned, setPinned] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pathname = usePathname();

  // Close when navigating.
  useEffect(() => {
    setOpen(false);
    setPinned(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      // Return focus to the trigger — otherwise closing the panel from deep
      // inside the mega-menu drops keyboard focus to <body>, stranding the user.
      if (e.key === 'Escape') {
        setOpen(false);
        setPinned(false);
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
    if (pinned) return;
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      className={mega ? styles.megaGroup : styles.navGroup}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onBlur={(e) => {
        if (ref.current?.contains(e.relatedTarget as Node)) return;
        setOpen(false);
        setPinned(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.navTrigger}
        data-active={active ? '' : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open || keepMounted ? panelId : undefined}
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setOpen(false);
            return;
          }
          setPinned(true);
          openNow();
        }}
      >
        {label}
        <ChevronDownIcon size={16} className={styles.caret} />
      </button>
      {(open || keepMounted) && (
        <div
          id={panelId}
          hidden={keepMounted ? !open : undefined}
          aria-label={panelLabel}
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
