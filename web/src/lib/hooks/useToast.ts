'use client';
import { useMemo } from 'react';
import { useUiStore, type Toast } from '@/lib/stores/ui';

/**
 * Toast helpers (UI store). The <Toaster> component renders + announces them
 * (aria-live). Memoized so callers can safely put the returned object (or its
 * methods) in a `useCallback`/`useMemo` dependency array without that
 * consumer being invalidated on every unrelated render — `addToast`/
 * `dismissToast` are already-stable Zustand selectors, so this object only
 * changes if the store's actions themselves are ever replaced (never, in
 * practice).
 */
export function useToast() {
  const addToast = useUiStore((s) => s.addToast);
  const dismissToast = useUiStore((s) => s.dismissToast);
  return useMemo(
    () => ({
      success: (message: string, action?: Toast['action']) =>
        addToast({ message, variant: 'success', action }),
      error: (message: string, action?: Toast['action']) =>
        addToast({ message, variant: 'error', action }),
      info: (message: string, action?: Toast['action']) =>
        addToast({ message, variant: 'info', action }),
      dismiss: dismissToast,
    }),
    [addToast, dismissToast],
  );
}
