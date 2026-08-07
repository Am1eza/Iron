'use client';
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap for dialogs/drawers/sheets. When `active`, it:
 *  - moves focus into the container ([data-autofocus] first, else the container),
 *  - cycles Tab/Shift+Tab within it,
 *  - calls `onEscape` on Esc,
 *  - locks body scroll (opt out with `{ lockScroll: false }`),
 *  - restores focus to the previously-focused element on deactivate.
 * Returns the container ref to spread onto the dialog element.
 *
 * `lockScroll` defaults to true because every original caller (Modal,
 * SkuDrawer, sheets) IS modal: content behind a scrim must not scroll. An
 * INLINE popover — a date picker anchored to its input, `aria-modal="false"`
 * — is the opposite case: it covers nothing, so freezing the page behind it
 * is a bug, not a feature. Those callers pass `{ lockScroll: false }`.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
  options?: { lockScroll?: boolean },
) {
  // Read into a primitive: `options` is an object literal at every call site,
  // so putting it in the dep array would re-run (and re-focus) the trap on
  // every single render.
  const lockScroll = options?.lockScroll ?? true;
  const ref = useRef<T | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  // Same problem as `options` above, but worse in practice: callers routinely
  // pass an inline arrow (`() => doThing()`), which is a fresh function
  // identity on every render — including every keystroke in any field inside
  // the trap, since typing sets state and re-renders the caller. With
  // `onEscape` in the effect's deps, that reran the WHOLE setup effect below
  // (including `focusFirst()`) on every keystroke, silently stealing focus
  // back to the first focusable element while the admin was mid-type. Keeping
  // the latest callback in a ref lets the keydown handler always call the
  // current one without the setup effect depending on its identity at all.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    lastFocused.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

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
        onEscapeRef.current?.();
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
      if (!first || !last) return;
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
      if (lockScroll) document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
    // `onEscape` intentionally excluded — see `onEscapeRef` above. Depending
    // on it here is exactly what caused the focus-stealing bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lockScroll]);

  return ref;
}
