'use client';
import { useEffect } from 'react';
import { useUiStore } from '@/lib/stores/ui';
import { useCartStore } from '@/lib/stores/cart';

/**
 * Rehydrates persisted Zustand stores after mount (skipHydration: true) and applies
 * the persisted theme to <html data-theme>. Avoids SSR/client hydration mismatches.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useUiStore.persist.rehydrate();
    void useCartStore.persist.rehydrate();
  }, []);

  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
}
