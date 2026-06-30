# Ahantime Web — State Management
## Layer 4 · Frontend — Document 3 (State Management)

**Version:** 1.0 · 26 June 2026
**Builds on:** `ARCHITECTURE.md`, `product/data-model.md`, `product/acceptance-criteria.md`.
**Purpose:** Define *where every kind of state lives* and wire it up — so data flow is predictable, SSR-correct, RTL-safe, and mock-able before the backend exists.

## 1. Principles
1. **Server-first.** Initial, SEO-critical data comes from **React Server Components**; the client hydrates only what it needs.
2. **The right tool per state category** (below) — no single global blob.
3. **URL is the source of truth for shareable view-state** (filters/search/sort/pagination) — matches IA canonicalization.
4. **Selectors over prop-drilling;** components subscribe to the minimal slice.
5. **Mock ⇄ live** via `NEXT_PUBLIC_API_MODE` — the same hooks work against fixtures or the backend.
6. **No hydration mismatches** — persisted/client-only state hydrates after mount.

## 2. State Categories → Tool
| Category | Examples | Tool |
|---|---|---|
| **Server state** (remote data) | prices, catalog, ticker, articles, leads | **RSC** (initial) + **TanStack Query** (client/live/mutations) |
| **URL state** (shareable view) | table filters, sort, `?q=`, page | **URL search params** (native `useSearchParams` / links via `lib/routes`) |
| **Client UI state** (ephemeral) | drawer/modal open, toasts, theme, reduced-motion | **Zustand** `uiStore` |
| **Persistent client state** | inquiry cart, dismissed popups, recently-viewed | **Zustand + persist** (`cartStore`, `uiStore`) |
| **Session/auth state** | user, club tier, auth status | **Zustand** `authStore` (hydrated from server) |
| **AI conversation** | messages, streaming status, suggestions | **Zustand** `aiStore` + Query for the `/api/ai/chat` call |
| **Form state** | OTP, request, calculators, cooperation | **React Hook Form + Zod** (local to the form) |

## 3. Server State — TanStack Query
- **Client config** (`lib/query/queryClient.ts`): `staleTime` 60s default, `gcTime` 5m, `refetchOnWindowFocus: false`, **no retry on 4xx** (limited on 5xx). One client per request on the server; a singleton in the browser.
- **SSR hydration:** server prefetches → `dehydrate` → `<HydrationBoundary>`; the client reuses cache, no refetch flash.
- **Live data:** the **ticker** uses `refetchInterval = TICKER_REFRESH (60s)`; charts/tables use ISR + on-demand client refresh.
- **Mutations:** lead submission, alerts, favorites — with **optimistic updates** + rollback; invalidate the relevant keys.
- **Keys:** central factory in `lib/query/keys.ts` (e.g., `['market']`, `['category', slug]`, `['table', cat, sub]`).

## 4. Client UI State — `uiStore` (Zustand)
- `theme` ('light'|'dark', persisted → `data-theme` on `<html>`), `reducedMotionOverride`, `drawerOpen`, `activeModal`, **`toasts[]`** (add/dismiss; `aria-live`).
- UI store is small and synchronous; components select single fields.

## 5. Persistent State — `cartStore` (Zustand + persist)
- The **inquiry cart (سبد استعلام)** persists to `localStorage` (`name: 'ahantime-cart'`, **versioned**, migration-ready).
- **Hydration guard:** `skipHydration: true` + a `<StoreHydrator>` that rehydrates on mount → no SSR mismatch.
- Selectors expose items, count, total weight, est. total.

## 6. Session / Auth — `authStore`
- `user | null`, `status` ('anonymous'|'authenticated'). The server reads the session cookie and seeds the store via `<AuthHydrator initialUser>` (no client fetch for first paint). OTP flow state lives in the login form (RHF), not global.

## 7. AI Conversation — `aiStore`
- `messages[]`, `status` ('idle'|'thinking'|'streaming'|'error'), `input`, `suggestions[]`, `sessionId` (memory). The actual streaming call goes through Query/`fetch` to `/api/ai/chat`; **grounding is server-side** (the store never fabricates numbers).

## 8. URL State (filters/search/sort)
- Filters (`?سایز=14&کارخانه=…`), sort, and `?q=` live in the **URL** (IA §3.3) — shareable, SEO-canonical, back-button-correct. Read via `useSearchParams`; write via router `replace` (no history spam). Never duplicate URL state in a store.

## 9. Providers wiring
`app/layout.tsx` → `<AppProviders>` (client) wraps children with `QueryClientProvider` (+ future Theme/Toast context). `<StoreHydrator>` rehydrates persisted stores. Server data is prefetched per route and passed via `HydrationBoundary` / hydrator components.

## 10. Mock ⇄ Live
- `lib/api/client.ts` + `lib/api/endpoints.ts` switch on `NEXT_PUBLIC_API_MODE`: **mock** returns fixtures (data-model §11); **live** fetches `/api/*` (then the backend). Hooks/components are identical in both modes.

## 11. Rules
- **Do**: server-first; selectors; URL for view-state; optimistic mutations with rollback; one query-key factory; hydrate persisted/client state after mount.
- **Don't**: put server data in Zustand; duplicate URL state; read `localStorage` during render; retry 4xx; create a god-store.

## 12. File Map
```
lib/
  query/    queryClient.ts · keys.ts
  api/      client.ts · endpoints.ts
  providers/ AppProviders.tsx · StoreHydrator.tsx · AuthHydrator.tsx
  stores/   ui.ts · cart.ts · ai.ts · auth.ts
  hooks/    useMarket.ts · useToast.ts · useReducedMotion.ts · useMediaQuery.ts
```

*Ahantime — اول مشورت، بعد خرید.*
