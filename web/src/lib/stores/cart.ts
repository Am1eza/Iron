import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PriceUnit } from '@/lib/types/domain';

export type CartItem = {
  skuId: string;
  name: string;
  qty: number;
  unit: PriceUnit;
  unitPrice?: number; // Toman (snapshot; final price confirmed at request)
  weightKg?: number; // per-unit theoretical weight
};

type CartState = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (skuId: string) => void;
  setQty: (skuId: string, qty: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.skuId === item.skuId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.skuId === item.skuId ? { ...i, qty: i.qty + item.qty } : i,
              ),
            };
          }
          return { items: [...s.items, item] };
        }),
      remove: (skuId) => set((s) => ({ items: s.items.filter((i) => i.skuId !== skuId) })),
      setQty: (skuId, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.skuId === skuId ? { ...i, qty: Math.max(1, qty) } : i)),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'fooladno-cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // rehydrated by <StoreHydrator/> → no SSR mismatch
    },
  ),
);

/* ---- derived selectors (use to avoid re-renders) ---- */
export const selectCartCount = (s: CartState) => s.items.length;
export const selectCartTotalWeight = (s: CartState) =>
  s.items.reduce((sum, i) => sum + (i.weightKg ?? 0) * i.qty, 0);
export const selectCartEstTotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * (i.weightKg ?? 1) * i.qty, 0);
