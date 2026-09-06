import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/utils/safeStorage';
import type { PriceBasis, PriceUnit } from '@/lib/types/domain';

export type CartItem = {
  skuId: string;
  name: string;
  qty: number;
  unit: PriceUnit;
  unitPrice?: number;
  /** What unitPrice is per. Required on new catalog adds; optional only for
   * carts persisted before v3 and synthetic/manual items. */
  priceBasis?: PriceBasis;
  weightKg?: number; // weight of ONE piece — only meaningful for branch/sheet/meter units; irrelevant for kg (qty IS the weight there)
};

type CartState = {
  items: CartItem[];
  /** Epoch ms of the last add/remove/qty change — null for an empty cart.
   *  Lets `CartReminder` tell "actively shopping right now" apart from
   *  "added something a while ago and never came back" (conversion audit
   *  finding, 2026-08-27: the cart persisted indefinitely but nothing ever
   *  resurfaced it to a returning visitor). NOT bumped by `clear()` — an
   *  emptied cart has nothing to remind anyone about. */
  lastUpdatedAt: number | null;
  add: (item: CartItem) => void;
  remove: (skuId: string) => void;
  setQty: (skuId: string, qty: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      lastUpdatedAt: null,
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.skuId === item.skuId);
          const items = existing
            ? s.items.map((i) => (i.skuId === item.skuId ? { ...i, qty: i.qty + item.qty } : i))
            : [...s.items, item];
          return { items, lastUpdatedAt: Date.now() };
        }),
      remove: (skuId) =>
        set((s) => ({ items: s.items.filter((i) => i.skuId !== skuId), lastUpdatedAt: Date.now() })),
      setQty: (skuId, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.skuId === skuId ? { ...i, qty: Math.max(1, qty) } : i)),
          lastUpdatedAt: Date.now(),
        })),
      clear: () => set({ items: [], lastUpdatedAt: null }),
    }),
    {
      name: 'ahantime-cart',
      version: 3,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true, // rehydrated by <StoreHydrator/> → no SSR mismatch
      // v1 → v2: added lastUpdatedAt. v3 adds priceBasis; old entries retain
      // the safe unit-derived fallback in cartItemEstimateToman and are always
      // re-priced by the server before a document is issued. An existing cart's real "last touched"
      // time is unknown, so it defaults to now — the safe direction to guess
      // wrong in, since it means CartReminder waits out the full threshold
      // before surfacing rather than immediately confronting a visitor whose
      // session just happened to upgrade.
      migrate: (persisted, version) => {
        const state = persisted as { items?: CartItem[] };
        if (version < 2) {
          return { items: state.items ?? [], lastUpdatedAt: (state.items?.length ?? 0) > 0 ? Date.now() : null };
        }
        return persisted as CartState;
      },
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

/** Snapshot estimate only; the server still re-prices authoritatively. A
 * non-kg price basis is charged per counted item, not per theoretical kg. */
export function cartItemEstimateToman(
  item: Pick<CartItem, 'unit' | 'qty' | 'unitPrice' | 'weightKg' | 'priceBasis'>,
): number {
  if (!item.unitPrice) return 0;
  // Pre-v3 carts were created when every snapshot was documented as per-kg;
  // defaulting them to a whole-item basis would silently inflate old carts.
  const basis = item.priceBasis ?? 'kg';
  return basis === 'kg' ? item.unitPrice * cartItemWeightKg(item) : item.unitPrice * item.qty;
}

export function inferSnapshotPriceBasis(item: Pick<CartItem, 'unit' | 'qty' | 'unitPrice' | 'weightKg'> & { lineTotal?: number }): PriceBasis {
  if (
    item.unitPrice &&
    item.lineTotal != null &&
    Math.abs(item.lineTotal - item.unitPrice * item.qty) < 1
  ) {
    if (item.unit === 'branch') return 'branch';
    if (item.unit === 'sheet') return 'sheet';
    if (item.unit === 'piece') return 'piece';
    if (item.unit === 'sqm') return 'sqm';
  }
  return 'kg';
}

/* ---- derived selectors (use to avoid re-renders) ---- */
export const selectCartCount = (s: CartState) => s.items.length;
export const selectCartTotalWeight = (s: CartState) =>
  s.items.reduce((sum, i) => sum + cartItemWeightKg(i), 0);
// `unitPrice` is per kg — this is Σ(unitPrice × real weight in kg), which is
// exactly the same basis `priceItems`/`createLead` use for the proforma.
export const selectCartEstTotal = (s: CartState) =>
  s.items.reduce((sum, i) => sum + cartItemEstimateToman(i), 0);
