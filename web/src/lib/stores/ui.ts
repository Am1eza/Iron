import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Toast = {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
  action?: { label: string; href?: string };
};

type UiState = {
  // persisted preferences
  theme: Theme;
  reducedMotionOverride: boolean | null; // null = follow system
  dismissedClubPopupAt: number | null; // 7-day suppression (empty-states H1)
  setTheme: (t: Theme) => void;
  setReducedMotionOverride: (v: boolean | null) => void;
  dismissClubPopup: () => void;

  // ephemeral UI
  drawerOpen: boolean;
  activeModal: string | null;
  toasts: Toast[];
  setDrawerOpen: (open: boolean) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  addToast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
};

let toastSeq = 0;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      reducedMotionOverride: null,
      dismissedClubPopupAt: null,
      setTheme: (theme) => set({ theme }),
      setReducedMotionOverride: (reducedMotionOverride) => set({ reducedMotionOverride }),
      dismissClubPopup: () => set({ dismissedClubPopupAt: Date.now() }),

      drawerOpen: false,
      activeModal: null,
      toasts: [],
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      openModal: (activeModal) => set({ activeModal }),
      closeModal: () => set({ activeModal: null }),
      addToast: (t) => {
        const id = `t${++toastSeq}`;
        set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-3) })); // max 3
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'poladin-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // only persist preferences, not ephemeral UI
      partialize: (s) => ({
        theme: s.theme,
        reducedMotionOverride: s.reducedMotionOverride,
        dismissedClubPopupAt: s.dismissedClubPopupAt,
      }),
    },
  ),
);
