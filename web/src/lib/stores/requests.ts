import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeLocalStorage } from '@/lib/utils/safeStorage';

/**
 * The user's request inbox — every «دریافت پیش‌فاکتور» / bulk / warehouse ask
 * lands here (mock persistence via localStorage; swaps for the API later).
 * Requests belong to the PROFILE: there are no anonymous request forms — CTAs
 * require login first, then file the request and send the user to
 * /account/requests where its status lives.
 */
export type RequestType = 'proforma' | 'bulk' | 'warehouse';
// 'fulfilled' (W20) — a warehouse request never gets a پیش‌فاکتور, so 'quoted'
// could never legitimately describe its terminal state; without a status that
// fits, every stored-goods request stayed "open" forever. See stepsForType().
export type RequestStatus = 'submitted' | 'reviewing' | 'contacted' | 'quoted' | 'fulfilled';

const COMMON_STEPS: { key: RequestStatus; label: string }[] = [
  { key: 'submitted', label: 'ثبت شد' },
  { key: 'reviewing', label: 'در حال بررسی' },
  { key: 'contacted', label: 'تماس کارشناس' },
];

export const REQUEST_STEPS: { key: RequestStatus; label: string }[] = [
  ...COMMON_STEPS,
  { key: 'quoted', label: 'پیش‌فاکتور صادر شد' },
];

/** Same shared first three steps for every request type; the terminal step's
 *  meaning depends on what was actually asked for. */
export function stepsForType(type: RequestType): { key: RequestStatus; label: string }[] {
  if (type === 'warehouse') {
    return [...COMMON_STEPS, { key: 'fulfilled', label: 'کالا در انبار ثبت شد' }];
  }
  return REQUEST_STEPS;
}

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
  /** Live mode: replace the local mirror with the server's list (sync hook).
   *  `keepLocal` (W20) — rows the import route reported as genuinely skipped
   *  (a real conflict, not a success) get appended instead of discarded, so
   *  a sync failure never silently loses a request that never made it to
   *  the server. */
  replaceAll: (requests: UserRequest[], keepLocal?: UserRequest[]) => void;
};

export const useRequestsStore = create<RequestsState>()(
  persist(
    (set) => ({
      requests: [],
      add: (req) => {
        const stamp = Date.now();
        // W20: was `RQ-${Date.now() % 100000}` — a 100,000-value space shared
        // by every visitor that collided across users within the same ~100s
        // window and silently dropped the loser on server import. A random
        // suffix makes an accidental collision practically impossible; the
        // import route additionally scopes its own conflict check per-user
        // now, so this is defense in depth, not the only guard.
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const created: UserRequest = {
          ...req,
          id: `rq-${stamp}-${suffix}`,
          ref: `RQ-${suffix}`,
          createdAt: new Date(stamp).toISOString(),
          status: 'submitted',
        };
        set((s) => ({ requests: [created, ...s.requests] }));
        return created;
      },
      clear: () => set({ requests: [] }),
      replaceAll: (requests, keepLocal) => {
        if (!keepLocal?.length) return set({ requests });
        // W20 review fix: a kept-local row whose ref is now present in the
        // server's authoritative list means THIS same row made it through on
        // a retry (the earlier "skip" was a same-user re-post conflict, not a
        // real loss) — drop it here, or it re-appends forever and compounds
        // across every future partial-failure sync.
        const serverRefs = new Set(requests.map((r) => r.ref));
        const localOnly = keepLocal.filter((r) => !serverRefs.has(r.ref));
        set({ requests: [...localOnly, ...requests] });
      },
    }),
    {
      name: 'ahantime-requests',
      // v1 is the FIRST version this store has ever declared. Under the
      // implicit v0 it wrote `{"state":{...},"version":0}`, so every existing
      // visitor's saved request list is a v0 payload sitting in localStorage
      // right now. Bumping the version WITHOUT a migrate would make zustand
      // log a warning and return undefined — silently wiping that list for
      // every current user, which for this store means losing the record of a
      // پیش‌فاکتور they filed. `migrate` therefore ships in the same change
      // and carries v0 forward unchanged: the shape did not change, only the
      // fact that it is now numbered. See requests.test.ts.
      version: 1,
      migrate: (persisted, fromVersion) => {
        if (fromVersion === 0) {
          const s = (persisted ?? {}) as Partial<RequestsState>;
          // Defensive: a hand-edited or truncated payload must degrade to an
          // empty inbox, never to `requests: undefined` (which would throw on
          // the first `.length`).
          return { ...s, requests: Array.isArray(s.requests) ? s.requests : [] };
        }
        return persisted as RequestsState;
      },
      storage: createJSONStorage(() => safeLocalStorage),
      // Without this, the store read localStorage during the render that React
      // hydrates against the server HTML — the server has no localStorage, so
      // any component showing a request count rendered one number on the
      // server and a different one on the client. Rehydrated after mount by
      // <StoreHydrator/> instead, exactly like the cart and ui stores.
      skipHydration: true,
    },
  ),
);

export const selectRequestCount = (s: RequestsState) => s.requests.length;
