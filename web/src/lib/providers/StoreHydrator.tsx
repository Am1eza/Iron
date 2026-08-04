'use client';
import { useEffect } from 'react';
import { useUiStore } from '@/lib/stores/ui';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useProfileStore } from '@/lib/stores/profile';

/**
 * Rehydrates persisted Zustand stores after mount (skipHydration: true) and applies
 * the persisted theme to <html data-theme>. Avoids SSR/client hydration mismatches.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useUiStore.persist.rehydrate();
    void useCartStore.persist.rehydrate();
    // requests/profile persisted to localStorage WITHOUT skipHydration until
    // now, so they read it during the render React hydrates against the
    // server HTML — a guaranteed mismatch for anyone with a saved request or
    // a chosen delivery city.
    void useRequestsStore.persist.rehydrate();
    void useProfileStore.persist.rehydrate();
  }, []);

  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
}
