# Fooladno Web

The Fooladno website — **Layer 4 (Frontend)**. Built on the specs in the repo root (`/docs`, `/product`, `/design`).

> See **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** for the full stack, structure, and conventions.

## Stack
Next.js 15 (App Router) · TypeScript (strict) · CSS Modules + design tokens · Zustand · TanStack Query · React Hook Form + Zod · MSW (mocks) · Vitest/Playwright/axe. Persian-first, **RTL**, Jalali, Toman. No UI kit, no external CDNs.

## Getting started
```bash
cd web
pnpm install
cp .env.example .env.local      # start with NEXT_PUBLIC_API_MODE=mock
# add self-hosted fonts to public/fonts/ (Estedad/Vazirmatn/Inter .var.woff2)
pnpm dev                        # http://localhost:3000
```

## Scripts
`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm format`

## Structure (short)
```
src/
  app/        routes (App Router) + api/ + admin/
  components/ primitives · layout · data · ai · commerce · feedback
  lib/        types · config · api · ai · mock · utils · hooks · stores
  styles/     tokens.css (canonical design tokens)
```

## Foundation in place
- RTL Persian root layout (`src/app/layout.tsx`) + skip-link + SEO metadata
- Canonical **design tokens** wired (`src/styles/tokens.css` → `globals.css`)
- Business constants (`lib/config/constants.ts`), format utils (digits/Toman/Jalali), domain types, and mock fixtures

## Conventions
Semantic tokens only (no hardcoded colors/spacing) · CSS **logical properties** (RTL) · server components by default (`"use client"` only when needed) · secrets server-only · WCAG 2.2 AA.

## Notes
- **Fonts:** self-host the `.var.woff2` files in `public/fonts/`; until then the system fallback renders.
- **API:** runs in **mock** mode (MSW + fixtures) until the backend layer; flip with `NEXT_PUBLIC_API_MODE`.

*Fooladno — اول مشورت، بعد خرید.*
