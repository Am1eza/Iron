# Poladin — Phase 2 · UX Engineering

**Status:** ✅ Built (items 11–20 implemented as real React components in the Next.js app).
**Builds on:** Phase 1 — Foundation, the UI/Design System (`design/*`, `web/src/styles/tokens.css`), and the engineering foundation (routing, state, forms, validation, API client, error handling).
**Spec source:** `product/navigation.md` (N1–N15), `product/information-architecture.md`, `product/wireframes.md`, `design/*`.

This phase turns the foundation into the **site shell + landing experience** — the chrome every page wears and the dual-mode home. Persian-first, RTL-native, token-only styling, WCAG 2.2 AA, reduced-motion aware.

---

## The 10 items — what was built

| # | Item | Component(s) | Nav spec |
|---|---|---|---|
| 11 | **Landing UX** | `app/page.tsx` (dual-mode home: AI door + structured door + trust) | IA, wireframes |
| 12 | **Navigation** | `lib/data/nav.ts` (single nav model) + active-state logic everywhere | N16 wayfinding |
| 13 | **Header** | `layout/Header.tsx` (sticky-condense, primary nav, utility) | N2 |
| 14 | **Footer** | `layout/Footer.tsx` (grouped columns + trust block + click-to-call) | N6 |
| 15 | **AI Hero Section** | `home/AIHero.tsx` (the AI door; grounding promise; starter chips) | N14 |
| 16 | **Product Navigation** | `layout/MegaMenu.tsx` (7 category columns + AI column) | N3 |
| 17 | **Category Navigation** | `layout/CategoryRail.tsx` (the signature rail; name⇄glyph morph) | N4 |
| 18 | **Mobile UX** | `layout/BottomTabBar.tsx` + `layout/MobileDrawer.tsx` (+ rail chip bar) | N12, N13 |
| 19 | **CTA Design** | amber `Button` Spark, AI «بپرس», «ثبت درخواست», bottom-bar AI orb | brand/motion |
| 20 | **Search UX** | `layout/SearchBar.tsx` (header inline + home `lg`, digit-normalized) | N15 |

Plus supporting pieces in this phase: `lib/data/catalog.ts` (server category helper), `primitives/icons.tsx` (custom line-icon set + category glyphs), `home/CategoryGrid.tsx`, `home/FeaturedPrices.tsx`, `home/ValueProps.tsx`, and the assembled chrome in `app/layout.tsx`.

---

## Architecture notes

- **Chrome lives in the root layout** (`app/layout.tsx`, now `async`): `Ticker → Header → MobileDrawer → main → Footer → BottomTabBar`. Categories are fetched once server-side via `getCategories()` and passed down, so the mega-menu / footer / drawer share one source.
- **Server vs client split:** `Footer`, `CategoryGrid`, `FeaturedPrices`, `ValueProps` are Server Components (no JS shipped). `Ticker`, `Header`, `MegaMenu`, `CategoryRail`, `BottomTabBar`, `MobileDrawer`, `SearchBar`, `AIHero` are Client Components (interactivity / store / router).
- **Single nav model** (`lib/data/nav.ts`): primary nav, tools, mega-menu sub-links, footer columns, channels — DRY across header/drawer/footer.
- **Active-state rule (N16):** every nav system marks exactly one "current" node via `usePathname()` + `data-active` + `aria-current="page"` (header links, rail, mega-menu column, bottom tab).

## Signature: the Category Rail (N4)

- **Desktop:** fixed to the inline-start edge (right, RTL), vertically centered; each item **rests as a name and morphs into its glyph** on hover/focus (tokenized crossfade → instant under `prefers-reduced-motion`). Current category shows glyph + a persistent Cobalt bar.
- **Tablet:** slim glyph strip. **Mobile:** a sticky horizontal **chip bar** under the header (tap → navigate).
- Pure-CSS morph (width/opacity transitions); one component, three responsive presentations.

## The AI door (N14) vs the structured door

- **AIHero** is unmistakably AI — Cobalt + the Spark orb, a large prompt field, starter chips, and an **honesty line**: «پاسخ‌ها بر پایهٔ قیمت‌های واقعی است؛ پولادین هرگز عدد نمی‌سازد». Submit deep-links to `/پولادین?q=…`.
- A parallel **structured door** (rail, FeaturedPrices preview, CategoryGrid) serves Pros who want to go straight to tables — the co-primary audience model.

## Accessibility & RTL

- Landmarks: `header`, `nav[aria-label="ناوبری اصلی"]`, `nav[aria-label="دسته‌بندی محصولات"]`, `footer`, plus the existing skip-link.
- **Mega-menu** `role="menu"` with hover-intent (150 ms) + Esc close. **Drawer** `role="dialog"`, focus-trapped, Esc/scrim close, scroll-locked, focus returns to the toggle, opens from the RTL start edge.
- Targets ≥44 px; visible Cobalt focus ring; directional icons mirror via `.icon--rtl`; Persian digits in badges/ticker; tabular figures for prices.
- Motion (ticker marquee, rail morph, drawer slide, AI orb pulse) all gate on `prefers-reduced-motion` / `useReducedMotion`.

## Ticker (N1)

- `Ticker` consumes `useMarket()` (60 s poll), marquee that pauses on hover/focus, static + manually-scrollable under reduced-motion, and **never blank** (falls back to last-known/seed values; «با تأخیر» on stale/error). Items are click-through to `/طلا-و-ارز`.

---

## Files added (Phase 2)

```
web/src/lib/data/catalog.ts        getCategories() server helper
web/src/lib/data/nav.ts            nav model (primary/tools/subs/footer/channels)
web/src/components/primitives/icons.tsx   line-icon set + CategoryGlyph
web/src/components/layout/Logo.{tsx,module.css}
web/src/components/layout/Ticker.{tsx,module.css}
web/src/components/layout/Header.{tsx,module.css}
web/src/components/layout/MegaMenu.{tsx,module.css}
web/src/components/layout/CategoryRail.{tsx,module.css}
web/src/components/layout/SearchBar.{tsx,module.css}
web/src/components/layout/Footer.{tsx,module.css}
web/src/components/layout/BottomTabBar.{tsx,module.css}
web/src/components/layout/MobileDrawer.{tsx,module.css}
web/src/components/home/AIHero.{tsx,module.css}
web/src/components/home/FeaturedPrices.{tsx,module.css}
web/src/components/home/CategoryGrid.{tsx,module.css}
web/src/components/home/ValueProps.{tsx,module.css}
```
Modified: `app/layout.tsx` (chrome), `app/page.tsx` (landing), `app/globals.css` (`.icon--rtl`).

> **Next phase:** catalog/Datasheet pages (the price tables behind the rail), the AI conversation view, and the request→پیش‌فاکتور commerce flow.

*Poladin — اول مشورت، بعد خرید.*
