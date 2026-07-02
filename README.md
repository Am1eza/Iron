# آهن‌تایم — Ahantime

**Smart Steel Marketplace · بازار هوشمند آهن و فولاد**

Ahantime is a smart iron & steel marketplace for Iran that pairs a grounded **AI advisor** with transparent **live prices**, a signature **guaranteed delivery time**, and a modern, human-closed (lead-gen) sales flow.

> **Promise:** «اول مشورت، بعد خرید.» — *First advice, then purchase.*

This repository currently holds the **complete specification** across three layers. Layer 4 (Frontend build) is next.

---

## How this project is structured (layers)

| Layer | Status | What it is |
|---|---|---|
| **1 · Vision** | ✅ complete | Why we exist, the market, the brand |
| **2 · Product Design** | ✅ complete | What we build, for whom, and how it behaves |
| **3 · UI / Design System** | ✅ complete | How it looks, feels, and is built (visually) |
| **4 · Frontend** | → next | The website, built on the above |
| 5 · Backend / AI / Integrations | planned | APIs, DeepSeek relay, SMS, tgju, admin |
| 6 · Web App · 7 · Mobile App | planned | Phase 2 & 3 |

---

## Document Index

### Layer 1 — Vision
- [`docs/vision.md`](docs/vision.md) — north star: problem, vision, mission, positioning, pillars, metrics
- [`docs/market-research.md`](docs/market-research.md) — Iran + global competitive research (cited)
- [`brand/brand-book.md`](brand/brand-book.md) — name, voice, color/type, logo, sub-brands
- [`brand/ahantime-symbol.svg`](brand/ahantime-symbol.svg) · [`brand/ahantime-logo-horizontal.svg`](brand/ahantime-logo-horizontal.svg) — logo concept (final art TBD)

### Layer 2 — Product Design
- [`product/product-scope.md`](product/product-scope.md) — scope, platforms, constraints, locked decisions
- [`product/mvp.md`](product/mvp.md) — MVP definition + acceptance + build sequence
- [`product/feature-list.md`](product/feature-list.md) — full feature brainstorm (with sources)
- [`product/user-prioritization.md`](product/user-prioritization.md) — personas + priority tiers
- [`product/user-stories.md`](product/user-stories.md) — stories with acceptance criteria
- [`product/acceptance-criteria.md`](product/acceptance-criteria.md) — exhaustive testable contract + constants
- [`product/ux-flow.md`](product/ux-flow.md) — end-to-end flows (Mermaid)
- [`product/wireframes.md`](product/wireframes.md) — low-fi RTL wireframes (all screens)
- [`product/information-architecture.md`](product/information-architecture.md) — taxonomy, sitemap, URLs, SEO
- [`product/navigation.md`](product/navigation.md) — every navigation system, in detail
- [`product/data-model.md`](product/data-model.md) — typed entities, relationships, API outline, mock strategy

### Layer 3 — UI / Design System
- [`design/design-language.md`](design/design-language.md) — "Engineered Calm"; the anti-AI-design manifesto
- [`design/color-system.md`](design/color-system.md) — graphite/cobalt/amber, tokens, contrast
- [`design/typography.md`](design/typography.md) — Persian-first type, the price-as-hero datasheet
- [`design/spacing-system.md`](design/spacing-system.md) — 4px grid, radius/shadow/z, layout
- [`design/components.md`](design/components.md) — ~56 components with states
- [`design/iconography.md`](design/iconography.md) — custom icon family + category cross-sections
- [`design/responsive-design.md`](design/responsive-design.md) — mobile-first, table→cards, safe areas
- [`design/accessibility.md`](design/accessibility.md) — WCAG 2.2 AA
- [`design/motion-design.md`](design/motion-design.md) — Engineered Motion + the Spark
- [`design/empty-states.md`](design/empty-states.md) — no-dead-ends, full copy catalog
- [`design/tokens.css`](design/tokens.css) — **canonical design tokens (single source for the build)**

---

## Key decisions (locked)
- **Name:** Ahantime (آهن‌تایم) · `.com` available at spec time.
- **Sales:** lead-gen + پیش‌فاکتور + human close — **no online payment (yet)**.
- **Prices:** 100% **admin-entered** (manual استعلام); no bourse formula. Weight = deterministic formula.
- **AI:** **DeepSeek**, server-side via an out-of-Iran relay; **grounded** (never invents a number).
- **Ticker:** FX/gold/ounce from **tgju.org**; **billet admin-entered**.
- **Auth:** mobile + **OTP**. **SMS:** SMS.ir (locked provider).
- **Hosting:** hybrid — app/DB in Iran, AI relay outside.
- **Audience:** co-primary **Contractor + Builder** (dual-mode).
- **Localization:** Persian-first, **RTL**, Jalali, Toman.

## Design north star (so the build never drifts)
- **Funnel, not brochure:** Magnet → Engage → Capture → Convert → Retain.
- **Engineered Calm:** minimal, structural, hairline datasheets — **never looks AI-generated**.
- **Triad:** Graphite = structure · **Cobalt = smart/interactive** · **Amber = act/value (the Spark)**.
- **Mono-accent · data color sacred · no glassmorphism · no gradients · small radii.**

## For Layer 4 (build)
- Start from [`design/tokens.css`](design/tokens.css) and the typed models in [`product/data-model.md`](product/data-model.md).
- Build against **mock fixtures** (data-model §11) so screens are clickable before the backend exists.
- Honor [`design/accessibility.md`](design/accessibility.md) and [`product/acceptance-criteria.md`](product/acceptance-criteria.md) as the Definition of Done.

## Layer 5 — Backend (implemented)
The full backend lives inside the Next.js app (`web/`), on **PostgreSQL + Drizzle**:
- **Catalog & pricing** — admin-entered prices with movement %, append-only history,
  Jalali freshness/staleness rules («تماس بگیرید» beyond 2 business days).
- **Auth** — mobile + OTP (SMS.ir), JWT + rotating refresh, RBAC; persistence in Postgres.
- **Conversion spine** — lead → پیش‌فاکتور (VAT, next-business-day validity) → SMS → CRM,
  plus order tracking, consignment warehouse, per-user requests inbox.
- **Engagement** — price alerts with a 60s evaluation job, favorites, customer club tiers.
- **Content & AI** — article approval/scheduling queue; DeepSeek relay (SSE, grounded tools)
  behind `AI_ENABLED`.
- **Admin panel** — pricing grid, CRM, orders, warehouse, content, catalog, users, settings,
  audit — all functional, every write audited.
- Mock mode still works (`NEXT_PUBLIC_API_MODE=mock`); see [`DEPLOY.md`](DEPLOY.md) to run
  the real stack (`docker compose up` = web + Postgres + Caddy; migrate + seed on boot).

---

*Ahantime — اول مشورت، بعد خرید.*
