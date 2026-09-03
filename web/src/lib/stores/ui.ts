import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/utils/safeStorage';

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
  dismissedCartReminderAt: number | null; // 24h suppression — see CartReminder.tsx
  setTheme: (t: Theme) => void;
  setReducedMotionOverride: (v: boolean | null) => void;
  dismissClubPopup: () => void;
  dismissCartReminder: () => void;

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

/** The inline ThemeScript (in <head>, runs pre-hydration) already resolved the
 *  correct starting theme onto <html data-theme> — from the persisted choice,
 *  or the OS `prefers-color-scheme` fallback for first-time visitors. Seed the
 *  store from that DOM value (not a hardcoded 'light') so StoreHydrator's
 *  post-mount sync can't stomp a correct OS-dark guess with a stale default
 *  before the async persist.rehydrate() resolves.
 */
function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.dataset.theme;
  return t === 'dark' ? 'dark' : 'light';
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: initialTheme(),
      reducedMotionOverride: null,
      dismissedClubPopupAt: null,
      dismissedCartReminderAt: null,
      setTheme: (theme) => set({ theme }),
      setReducedMotionOverride: (reducedMotionOverride) => set({ reducedMotionOverride }),
      dismissClubPopup: () => set({ dismissedClubPopupAt: Date.now() }),
      dismissCartReminder: () => set({ dismissedCartReminderAt: Date.now() }),

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
      name: 'ahantime-ui',
      // v2: one-time reset of theme to 'light'. Under v1 the pre-paint
      // theme-init.js seeded first-time visitors from the OS
      // `prefers-color-scheme`, so dark-OS users had theme:'dark' persisted
      // without ever choosing it. The site is light-only for visitors now
      // (see public/theme-init.js), so migrate that stale guess away.
      // v3: added dismissedCartReminderAt (CartReminder.tsx) — defaults to
      // null for every existing visitor, same as a first-time one; nothing
      // to carry forward since the field didn't exist yet.
      version: 3,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<UiState>;
        return { ...s, theme: 'light' as Theme, dismissedCartReminderAt: s.dismissedCartReminderAt ?? null };
      },
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      // only persist preferences, not ephemeral UI
      partialize: (s) => ({
        theme: s.theme,
        reducedMotionOverride: s.reducedMotionOverride,
        dismissedClubPopupAt: s.dismissedClubPopupAt,
        dismissedCartReminderAt: s.dismissedCartReminderAt,
      }),
    },
  ),
);
