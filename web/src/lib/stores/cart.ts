import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/utils/safeStorage';
import type { PriceUnit } from '@/lib/types/domain';

export type CartItem = {
  skuId: string;
  name: string;
  qty: number;
  unit: PriceUnit;
  unitPrice?: number; // Toman PER KILOGRAM (snapshot; final price confirmed at request)
  weightKg?: number; // weight of ONE piece — only meaningful for branch/sheet/meter units; irrelevant for kg (qty IS the weight there)
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
      name: 'ahantime-cart',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true, // rehydrated by <StoreHydrator/> → no SSR mismatch
    },
  ),
);

/**
 * The item's real weight contribution in kg. For `unit === 'kg'`, `qty`
 * already IS the weight — `weightKg` is a per-BRANCH/PIECE reference figure
 * that does not apply there, and multiplying by it double-counted weight
 * (and, via `selectCartEstTotal`, inflated the shown estimate the same way —
 * both selectors used to do this unconditionally). For a piece-priced unit
 * (branch/sheet/meter), `weightKg` is the weight of ONE piece, so the total
 * is `weightKg × qty`. Mirrors the identical conversion in
 * `leads.service.ts`'s `priceItems` so the cart's estimate can never drift
 * from what the issued پیش‌فاکتور actually charges.
 */
export function cartItemWeightKg(item: Pick<CartItem, 'unit' | 'qty' | 'weightKg'>): number {
  return item.unit === 'kg' ? item.qty : (item.weightKg ?? 0) * item.qty;
}

/* ---- derived selectors (use to avoid re-renders) ---- */
export const selectCartCount = (s: CartState) => s.items.length;
export const selectCartTotalWeight = (s: CartState) =>
  s.items.reduce((sum, i) => sum + cartItemWeightKg(i), 0);
// `unitPrice` is per kg — this is Σ(unitPrice × real weight in kg), which is
// exactly the same basis `priceItems`/`createLead` use for the proforma.
export const selectCartEstTotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * cartItemWeightKg(i), 0);
