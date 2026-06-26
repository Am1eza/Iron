'use client';
import { useUiStore, type Toast } from '@/lib/stores/ui';

/** Toast helpers (UI store). The <Toaster> component renders + announces them (aria-live). */
export function useToast() {
  const addToast = useUiStore((s) => s.addToast);
  const dismissToast = useUiStore((s) => s.dismissToast);
  return {
    success: (message: string, action?: Toast['action']) =>
      addToast({ message, variant: 'success', action }),
    error: (message: string, action?: Toast['action']) =>
      addToast({ message, variant: 'error', action }),
    info: (message: string, action?: Toast['action']) =>
      addToast({ message, variant: 'info', action }),
    dismiss: dismissToast,
  };
}
