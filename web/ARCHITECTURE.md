# Poladin Web — Frontend Architecture & Project Structure
## Layer 4 · Frontend — Document 1 (Project Structure)

**Version:** 1.0 · 26 June 2026
**Builds on:** all of Layers 1–3, especially `design/tokens.css`, `product/data-model.md`, `product/information-architecture.md`, `product/acceptance-criteria.md`.
**Purpose:** Lock the stack, the folder structure, and the conventions for building the Poladin **website** — so every later section (components, pages, AI, admin) drops into a clean, scalable foundation.

---

## 1. Tech Stack (and why — mapped to our constraints)

| Concern (from the specs) | Choice | Why |
|---|---|---|
| **SEO is the lifeblood**; SSR/indexable price pages | **Next.js 15 (App Router)** | Best-in-class SSR/SSG/ISR, metadata API, schema.org, sitemaps; RSC for fast data pages |
| **AI must run server-side** (DeepSeek via relay, keys hidden) | Next **Route Handlers / Server Actions** | API runs on the server; secrets never reach the browser |
| **Mobile-first, PWA path** | Next + Web Manifest + SW | installable; aligns with Phase-3 app |
| **RTL / Persian / Jalali / Toman** | CSS **logical properties** + `date-fns-jalali` + format utils | already RTL-native in `tokens.css`; no rework |
| **Premium, custom look (never templated)** | **CSS Modules + `tokens.css`** (no UI kit) | full bespoke control; zero template smell; tokens are the single source |
| **Typed domain + mocks before backend** | **TypeScript (strict)** + **Zod** + **MSW** | types from `data-model.md`; clickable screens with mock data |
| **Forms (OTP, request, calculators)** | **React Hook Form + Zod** | accessible, validated (acceptance-criteria) |
| **Client state (cart, AI session, UI)** | **Zustand**; **TanStack Query** for client fetch/cache | small, fast; most data via RSC |
| **Quality gates** | ESLint + Prettier + Vitest + Testing Library + **axe** + Playwright | a11y (WCAG 2.2 AA) & acceptance criteria in CI |
| **Package manager** | **pnpm** | fast, disk-efficient |

**Explicitly NOT used:** Tailwind/Bootstrap/MUI or any component kit (they push a generic look — banned by the Design Language); no external font/JS CDNs (Iran reachability — everything self-hosted).

---

## 2. Repository Layout (monorepo-ready)
Specs stay at the root; the website lives in `web/`. Future backend / web-app / mobile can join as siblings (`apps/*`).
```
/                      ← specs (docs, product, design, brand) + README
└─ web/                ← THIS app (Next.js website)
```

## 3. `web/` Folder Structure
```
web/
├─ ARCHITECTURE.md            ← this doc
├─ package.json · tsconfig.json · next.config.mjs · postcss.config.mjs
├─ .eslintrc.json · .prettierrc.json · .env.example · .gitignore
├─ public/
│  ├─ fonts/                  ← Estedad/Vazirmatn/Inter .woff2 (self-hosted; add binaries)
│  ├─ icons/                  ← custom SVG icon set + app icons + favicon
│  ├─ images/                 ← category/brand imagery
│  └─ manifest.webmanifest    ← PWA (later)
└─ src/
   ├─ app/                    ← App Router (routes ↔ IA §3)
   │  ├─ layout.tsx           ← root: <html lang="fa" dir="rtl">, fonts, tokens, providers
   │  ├─ globals.css          ← imports tokens.css + minimal app base
   │  ├─ page.tsx             ← Home (dual-mode)
   │  ├─ not-found.tsx · error.tsx · sitemap.ts · robots.ts   (added in routing section)
   │  ├─ قیمت/                ← catalog: [category]/[sub]/[sku] (Persian segments per IA)
   │  ├─ پولادین/             ← AI advisor
   │  ├─ طلا-و-ارز/ · ابزار/ · حساب/ · باشگاه/ · وبلاگ/ · همکاری/ · درخواست/ · سبد-استعلام/
   │  ├─ api/                 ← route handlers: ai/chat, auth/otp, leads, market, tools (server-only)
   │  └─ admin/               ← admin panel (noindex, role-gated)
   ├─ components/             ← UI from the Component Library
   │  ├─ primitives/          ← Button, Input, Select, Switch, Chip, Badge, Icon, OTPInput…
   │  ├─ layout/              ← Header, Footer, CategoryRail, Ticker, Nav, BottomBar, Drawer
   │  ├─ data/                ← PriceTable, PriceCell, Movement, DeliveryBadge, Chart, Stat
   │  ├─ ai/                  ← AIHero, AIChat, EstimateCard, SuggestChips
   │  ├─ commerce/            ← InquiryCart, Proforma, RequestForm, AlertForm
   │  └─ feedback/            ← Modal, BottomSheet, Toast, EmptyState, Skeleton
   ├─ lib/
   │  ├─ types/               ← domain.ts (from data-model.md)
   │  ├─ config/              ← constants.ts (acceptance-criteria §1.4), env.ts
   │  ├─ api/                 ← typed client + endpoints
   │  ├─ ai/                  ← DeepSeek relay client + tool defs (server-only)
   │  ├─ mock/                ← fixtures.ts + MSW handlers
   │  ├─ utils/               ← format (digits/Toman/Jalali), rtl, seo, validators (zod)
   │  ├─ hooks/               ← useReducedMotion, useMediaQuery, useOtp…
   │  └─ stores/              ← zustand: cart, aiSession, ui
   ├─ styles/
   │  └─ tokens.css           ← canonical tokens (synced from /design/tokens.css)
   └─ content/                ← MDX blog/news (later)
```

## 4. Routing ↔ IA
- Route segments mirror **IA §3** Persian slugs (Next supports non-ASCII segments): `app/قیمت/[category]/[sub]/[sku]/page.tsx`, etc.
- Dynamic params resolve against catalog data (`data-model`); each price/SKU/article page is **server-rendered + metadata + schema.org** (acceptance-criteria §1.7).
- `admin/*` and personal routes (`حساب`, `درخواست`, `سبد-استعلام`, `جستجو`) are **`noindex`**.

## 5. Styling Conventions
- **Global `tokens.css`** holds all design tokens + base layer + the Spark. Components import **semantic tokens only** (`--color-*`, `--t-*`, `--space-*`) — never hardcoded values, never primitives.
- **Per-component `*.module.css`** co-located with the component; **CSS logical properties** only (RTL-safe).
- One amber action per view; cobalt = interactive; green/red only in data (color-system rules enforced by review).

## 6. Server vs Client
- **Default = Server Components** (data pages, SEO). Add `"use client"` only for interactivity (AI chat, cart, toggles, forms, rail hover).
- **Secrets** (DeepSeek, SMS, tgju) live only in **route handlers / server**; never in client bundles.
- AI: `POST /api/ai/chat` streams from the **DeepSeek relay** with tool-calling (`getPrice`, `calcWeight`, `estimateProject`, `createLead`) — grounding enforced server-side (acceptance-criteria §D).

## 7. Data & Mocks
- Types come from **`product/data-model.md`** (mirrored in `lib/types/domain.ts`).
- **Zod** schemas validate inputs/outputs (shared with forms).
- **MSW + `lib/mock/fixtures.ts`** serve realistic data for all 7 categories so screens are fully clickable **before the backend exists** (data-model §11). Swap `NEXT_PUBLIC_API_MODE=mock|live` to flip.

## 8. Quality Gates (Definition of Done)
- **TypeScript strict**, ESLint (`next/core-web-vitals` + `next/typescript`), Prettier.
- **Vitest + Testing Library** (unit/component), **axe** (a11y), **Playwright** (e2e core flows).
- Performance budgets (acceptance-criteria §1.2): LCP < 2.5s, TTFB < 0.8s, CLS < 0.1.
- a11y = **WCAG 2.2 AA** (`design/accessibility.md`).

## 9. Environment (`.env.example`)
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_MODE`, `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` (relay), `KAVENEGAR_API_KEY`, `TGJU_*`, `JWT/SESSION_SECRET`. Secrets are server-only (no `NEXT_PUBLIC_` prefix).

## 10. Scripts
`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm format`.

## 11. Conventions (naming & code)
- Components `PascalCase` (+ `Component.module.css`, `Component.test.tsx` co-located); utils/hooks `camelCase`; routes/assets `kebab`/Persian-slug.
- Import alias `@/*` → `src/*`.
- No default exports for shared utils (named exports); one component per file.
- Tokens-only styling; logical properties only; Persian via ZWNJ; tabular numerals for data.

## 12. Build & Deploy (hybrid hosting)
- App + DB target **inside Iran**; the **AI relay** (DeepSeek) runs **outside Iran**, called server-side (product-scope §11). Build is a standard Next output (Node server or standalone). PWA/SW added in a later section.

## 13. What this section delivers (scaffolded now)
Config (`package.json`, `tsconfig`, `next.config`, lint/format, env, gitignore) · `src/app/layout.tsx` (RTL shell + tokens) · `globals.css` · `tokens.css` · `lib/config/constants.ts` · `lib/utils/format.ts` (digits/Toman/Jalali) · `lib/types/domain.ts` · `lib/mock/fixtures.ts` · a Home placeholder · `web/README.md`.
**Next sections:** Foundation/Theme provider → primitives → layout (Header/Rail/Ticker) → Home → catalog/price table → AI → commerce → admin.

*Poladin — اول مشورت، بعد خرید.*
