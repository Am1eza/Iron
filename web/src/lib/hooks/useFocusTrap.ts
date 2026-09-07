'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';

const FOCUSABLE = 'a[href], button, textarea, input:not([type="hidden"]), select, [tabindex]';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      !el.closest('[hidden], [inert]') &&
      getComputedStyle(el).visibility !== 'hidden',
  );
}

type Trap = { container: HTMLElement; lockScroll: boolean };
const traps: Trap[] = [];
let savedOverflow = '';
const modalListeners = new Set<() => void>();
const isModalOpen = () => traps.some((trap) => trap.lockScroll);
const serverModalOpen = () => false;

function notifyModalListeners() {
  for (const listener of modalListeners) listener();
}

/** Focus, Tab/Escape handling, and scroll locking for dialogs and popovers.
 * Only the most recently opened trap handles keys. Nested dialogs share one
 * scroll lock, restored after the final modal closes, in any closing order. */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
  options?: { lockScroll?: boolean },
) {
  const lockScroll = options?.lockScroll ?? true;
  const ref = useRef<T | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;
    const lastFocused = document.activeElement as HTMLElement | null;
    if (lockScroll && !isModalOpen()) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const trap = { container, lockScroll };
    // Child effects can run before their parent on a shared mount.
    const descendant = traps.findIndex((item) => container.contains(item.container));
    if (descendant === -1) traps.push(trap);
    else traps.splice(descendant, 0, trap);
    notifyModalListeners();

    if (traps[traps.length - 1] === trap) {
      const items = focusableElements(container);
      (items.find((el) => el.hasAttribute('data-autofocus')) ?? items[0] ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (traps[traps.length - 1] !== trap) return;
      if (event.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableElements(container).filter((el) => el.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const focused = document.activeElement;
      if (
        !items.includes(focused as HTMLElement) ||
        (event.shiftKey ? focused === first : focused === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = traps[traps.length - 1] === trap;
      traps.splice(traps.indexOf(trap), 1);
      if (lockScroll && !isModalOpen()) document.body.style.overflow = savedOverflow;
      notifyModalListeners();
      if (wasTop && lastFocused?.isConnected) lastFocused.focus();
    };
  }, [active, lockScroll]);

  return ref;
}

function subscribeModalDepth(listener: () => void) {
  modalListeners.add(listener);
  return () => {
    modalListeners.delete(listener);
  };
}

/** Whether floating UI should yield to an open modal. False during SSR. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(subscribeModalDepth, isModalOpen, serverModalOpen);
}
