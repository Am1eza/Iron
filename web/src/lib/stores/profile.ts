import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Buyer profile preferences (mock persistence via localStorage). The warehouse
 * city feeds the landed-cost benchmark in «مقایسهٔ کارخانه‌ها»: freight and
 * delivery time are computed from our انبار شادآباد تهران to this city.
 */
type ProfileState = {
  /** شهر انبار/تحویل کاربر — key into CITY_DISTANCES. */
  warehouseCity: string | null;
  setWarehouseCity: (city: string | null) => void;
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      warehouseCity: null,
      setWarehouseCity: (warehouseCity) => set({ warehouseCity }),
    }),
    {
      name: 'ahantime-profile',
      // Same first-ever version bump as the requests store, and the same
      // reason for shipping `migrate` alongside it: without one, zustand
      // discards the existing v0 payload, and every visitor who had already
      // chosen a delivery city would silently lose it — quietly changing the
      // freight and delivery-time numbers on «مقایسهٔ کارخانه‌ها» back to the
      // default. The shape is unchanged; v0 is carried forward as-is.
      version: 1,
      migrate: (persisted, fromVersion) => {
        if (fromVersion === 0) {
          const s = (persisted ?? {}) as Partial<ProfileState>;
          return { ...s, warehouseCity: typeof s.warehouseCity === 'string' ? s.warehouseCity : null };
        }
        return persisted as ProfileState;
      },
      storage: createJSONStorage(() => localStorage),
      // Read localStorage during the hydrating render and the server (which
      // has none) and the client disagree about the selected city — a React
      // hydration mismatch on every page that shows it. Rehydrated after
      // mount by <StoreHydrator/>.
      skipHydration: true,
    },
  ),
);
