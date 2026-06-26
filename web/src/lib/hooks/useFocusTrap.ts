'use client';
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap for dialogs/drawers/sheets. When `active`, it:
 *  - moves focus into the container ([data-autofocus] first, else the container),
 *  - cycles Tab/Shift+Tab within it,
 *  - calls `onEscape` on Esc,
 *  - locks body scroll,
 *  - restores focus to the previously-focused element on deactivate.
 * Returns the container ref to spread onto the dialog element.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const ref = useRef<T | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    lastFocused.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const target =
        container.querySelector<HTMLElement>('[data-autofocus]') ??
        container.querySelector<HTMLElement>(FOCUSABLE) ??
        container;
      target.focus();
    };
    focusFirst();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [active, onEscape]);

  return ref;
}
