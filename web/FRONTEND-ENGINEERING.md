# Fooladno — Phase 4 · Frontend Engineering

**Status:** ✅ Complete. The frontend engineering layer (items 31–50) is implemented and wired into the app. Several items were established in earlier phases (Foundation 1–10, UX Eng. 11–20, UI Eng. 21–30); this phase **fills the remaining gaps** (infinite scroll, URL-synced pagination, responsive/a11y utilities, SEO components, no-flash theming, localization layer, web-vitals, code splitting, and a test scaffold) and audits the whole layer.

---

## The 20 items — audit

| # | Item | Where | Status |
|---|------|-------|--------|
| 31 | **Project Structure** | `ARCHITECTURE.md`; `src/{app,components,lib}` | ✅ established |
| 32 | **Routing** | `ROUTING.md`; full App Router tree + `lib/routes.ts` + `middleware.ts` | ✅ established |
| 33 | **Layout System** | Phase 2 chrome + Phase 3 `ui/Layout` (Container/Section/Stack/Cluster/Grid) | ✅ established |
| 34 | **State Management** | `STATE-MANAGEMENT.md`; Zustand stores + TanStack Query | ✅ established |
| 35 | **API Layer** | `API-CLIENT.md`; `lib/api/*` (http, resources, mock⇄live) | ✅ established |
| 36 | **Forms** | `FORMS.md`; RHF + zodResolver, `components/forms/*` | ✅ established |
| 37 | **Error Handling** | `ERROR-HANDLING.md`; ErrorBoundary, `error.tsx`/`global-error.tsx`, `errors/report.ts` | ✅ established |
| 38 | **Validation** | `VALIDATION.md`; Zod single-source (`lib/validation/*`) | ✅ established |
| 39 | **Toast Notifications** | `feedback/Toaster.tsx` + `stores/ui` + `useToast` | ✅ established |
| 40 | **Skeleton Loading** | Phase 3 `ui/Skeleton` (Skeleton/SkeletonText/TableSkeleton); `app/loading.tsx` | ✅ established |
| 41 | **Infinite Scroll** | **`ui/InfiniteScroll` + `hooks/useIntersectionObserver`** | ✅ **new** |
| 42 | **Pagination** | Phase 3 `ui/Pagination` + **`hooks/usePagination`** (URL-synced `?page=`) | ✅ **new hook** |
| 43 | **Responsive Design** | **`responsive/breakpoints` + `hooks/useBreakpoint`/`useDevice` + `ui/Show`** | ✅ **new** |
| 44 | **Accessibility** | **`hooks/useFocusTrap`, `a11y/Announcer` + `useAnnounce`, `a11y/VisuallyHidden`** (+ `accessibility.md`) | ✅ **new utils** |
| 45 | **SEO Components** | **`seo/JsonLd` + `BreadcrumbJsonLd`** over `lib/seo.ts`; `sitemap.ts`/`robots.ts`/metadata | ✅ **new** |
| 46 | **Theme** | **`theme/ThemeScript` (no-flash)** + Phase 3 `ThemeToggle` + `lib/theme/tokens.ts` | ✅ **hardened** |
| 47 | **Localization** | **`lib/i18n/` (locale config, fa strings dict, `t()`)** + format helpers | ✅ **new** |
| 48 | **Performance** | **`perf/webVitals` + `perf/WebVitals`** (budgets + reporting); next/image/font config | ✅ **new** |
| 49 | **Code Splitting** | **`components/lazy.ts`** (`next/dynamic` for MegaMenu/Modal) + automatic route splitting | ✅ **new** |
| 50 | **Frontend Testing** | **`vitest.config.ts` + `vitest.setup.ts` + example unit/component tests**; Playwright+axe for e2e | ✅ **new** |

---

## New this phase — details

### 41 · Infinite Scroll
`useIntersectionObserver` (generic, freeze-once option) + `<InfiniteScroll>` that auto-loads the next page when a sentinel nears the viewport (`rootMargin: 300px` to prefetch), with a `manual` «نمایش بیشتر» fallback, a polite live region, and an end-of-list marker. Pairs with TanStack `useInfiniteQuery`.

### 42 · Pagination
`usePagination` keeps the page in `?page=` (shareable, restorable on back/forward, crawlable), omits the param for page 1 (clean canonical), and returns `{ page, setPage, hrefFor }` to feed the existing `<Pagination>` component.

### 43 · Responsive
`BREAKPOINTS` (sm/md/lg/xl/wide) is the single JS source matching the CSS. `useBreakpoint(bp)`/`useDevice()` for JS branches; `<Show above|below>` for **CSS-only** visibility (SSR-safe, no hydration flash via `display: contents`).

### 44 · Accessibility
`useFocusTrap(active, onEscape)` centralizes dialog focus management (Modal now uses it); a global `<Announcer>` + `useAnnounce()` provide polite/assertive live-region messages (route changes, async results, filter counts); `<VisuallyHidden>` wraps the utility class. Skip-link + landmarks already in place.

### 45 · SEO Components
`<JsonLd data={…}>` server-renders schema.org graphs from `lib/seo.ts` builders; `<BreadcrumbJsonLd items={…}>` pairs structured data with the visual breadcrumb. Home now emits Organization + LocalBusiness via `<JsonLd>`.

### 46 · Theme (no-flash)
`<ThemeScript>` runs before first paint (top of `<body>`), reading the persisted `fooladno-ui` preference or `prefers-color-scheme` and setting `:root[data-theme]` — eliminating the light→dark FOUC. `<StoreHydrator>` keeps it in sync after hydration.

### 47 · Localization
`lib/i18n/` formalizes the Persian-first model: `LOCALES` (fa active; en/ar reserved with dir/calendar/digits/currency), a typed `fa` strings dictionary for cross-cutting copy, and `t(key, vars)` with `{token}` interpolation. Number/date localization (Persian digits, Toman, Jalali) is re-exported from `lib/utils/format.ts`.

### 48 · Performance
`perf/webVitals.ts` defines Core Web Vitals budgets (LCP 2.5s · INP 200ms · CLS 0.1 · FCP 1.8s · TTFB 0.8s) and a reporter (dev console / prod `sendBeacon`); `<WebVitals>` subscribes via `next/web-vitals`. Self-hosted variable fonts (`font-display: swap`), `next/image` AVIF/WebP, and token-driven CSS keep payloads lean.

### 49 · Code Splitting
`components/lazy.ts` defers interaction-only client components with `next/dynamic` (the «محصولات» MegaMenu and the Modal), on top of automatic route-level splitting. The `/styleguide` kitchen-sink is its own route chunk.

### 50 · Frontend Testing
`vitest.config.ts` (jsdom + Testing Library + jest-dom, `@/` alias, CSS Modules ignored) and `vitest.setup.ts` (cleanup + `matchMedia` stub). Example suites: `lib/utils/format.test.ts`, `lib/validation/schemas.test.ts`, `components/ui/PriceParts.test.tsx`. E2E + accessibility run on Playwright + `@axe-core/playwright` (`pnpm test:e2e`). Added devDeps: `@vitejs/plugin-react`, `jsdom`, `@testing-library/user-event`.

---

## Files added (Phase 4)
```
src/lib/hooks/useIntersectionObserver.ts · usePagination.ts · useBreakpoint.ts · useFocusTrap.ts · useAnnounce.ts
src/lib/responsive/breakpoints.ts
src/lib/i18n/{locale,strings,index}.ts
src/lib/perf/webVitals.ts
src/lib/stores/announcer.ts
src/components/ui/{InfiniteScroll,Show}.{tsx,module.css}
src/components/a11y/{Announcer,VisuallyHidden}.tsx
src/components/seo/JsonLd.tsx
src/components/theme/ThemeScript.tsx
src/components/perf/WebVitals.tsx
src/components/lazy.ts
vitest.config.ts · vitest.setup.ts
src/lib/utils/format.test.ts · src/lib/validation/schemas.test.ts · src/components/ui/PriceParts.test.tsx
```
Modified: `app/layout.tsx` (ThemeScript), `providers/AppProviders.tsx` (Announcer + WebVitals), `app/page.tsx` (JsonLd), `ui/Modal.tsx` (useFocusTrap), `layout/Header.tsx` (lazy MegaMenu), `ui/index.ts` (Show/InfiniteScroll/VisuallyHidden), `package.json` (test devDeps).

> **Next phase:** the data/feature screens — the price **Datasheet** (E1) with filters/sort/pagination/infinite-scroll, the **AI conversation** view, and the **request → پیش‌فاکتور** commerce flow — assembled from the UI system and wired to the API layer.

*Fooladno — اول مشورت، بعد خرید.*
