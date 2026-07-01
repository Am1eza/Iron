import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The user's request inbox — every «دریافت پیش‌فاکتور» / bulk / warehouse ask
 * lands here (mock persistence via localStorage; swaps for the API later).
 * Requests belong to the PROFILE: there are no anonymous request forms — CTAs
 * require login first, then file the request and send the user to
 * /account/requests where its status lives.
 */
export type RequestType = 'proforma' | 'bulk' | 'warehouse';
export type RequestStatus = 'submitted' | 'reviewing' | 'contacted' | 'quoted';

export const REQUEST_STEPS: { key: RequestStatus; label: string }[] = [
  { key: 'submitted', label: 'ثبت شد' },
  { key: 'reviewing', label: 'در حال بررسی' },
  { key: 'contacted', label: 'تماس کارشناس' },
  { key: 'quoted', label: 'پیش‌فاکتور صادر شد' },
];

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  proforma: 'پیش‌فاکتور',
  bulk: 'خرید عمده',
  warehouse: 'انبار مشتریان',
};

export type UserRequest = {
  id: string;
  ref: string;
  type: RequestType;
  title: string;
  detail?: string;
  note?: string;
  createdAt: string; // ISO
  status: RequestStatus;
};

type RequestsState = {
  requests: UserRequest[];
  add: (req: Pick<UserRequest, 'type' | 'title' | 'detail' | 'note'>) => UserRequest;
  clear: () => void;
};

export const useRequestsStore = create<RequestsState>()(
  persist(
    (set) => ({
      requests: [],
      add: (req) => {
        const stamp = Date.now();
        const created: UserRequest = {
          ...req,
          id: `rq-${stamp}`,
          ref: `RQ-${String(stamp % 100000).padStart(5, '0')}`,
          createdAt: new Date(stamp).toISOString(),
          status: 'submitted',
        };
        set((s) => ({ requests: [created, ...s.requests] }));
        return created;
      },
      clear: () => set({ requests: [] }),
    }),
    {
      name: 'ahantime-requests',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const selectRequestCount = (s: RequestsState) => s.requests.length;
