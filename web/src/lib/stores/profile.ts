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
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
