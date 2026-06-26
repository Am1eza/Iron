# Poladin — Product Roadmap
## Phase 1 · Foundation — #9

**Version:** 1.0 · 26 June 2026
**Companions:** `product/mvp.md`, `product/feature-list.md`, `product/product-scope.md`.
**Purpose:** The sequence of value delivery — Now / Next / Later + platform phases — with themes, contents, and dependencies. (No hard dates; relative sequencing.)

### Philosophy
Ship the **trusted core** first (prove the funnel), then **retain & differentiate**, then **expand platform & monetize**. Each release has one theme and a clear exit criterion.

---

## NOW — MVP · Theme: "Trusted prices + AI + lead engine"
**Goal:** a trustworthy site where buyers get live prices + grounded AI advice and submit qualified requests; admin keeps prices fresh.
**Contents** (per `mvp.md`): admin price grid + catalog · price tables (Datasheet, زمان تحویل, charts/exports/favorites) · نبض بازار ticker · grounded AI advisor + پروژه‌سنج/وزن‌سنج · lead → پیش‌فاکتور → SMS → CRM · OTP accounts · price alerts · customer club · AI news/blog (editor-approved) · trust + cooperation pages · همکاری.
**Exit criteria:** prices publishable daily with stale-flagging; AI grounded (zero ungrounded numbers); request→پیش‌فاکتور→CRM end-to-end; core pages indexable; brand applied.

> **Engineering progress (foundation already built):** project structure · routing (full IA tree) · state management · forms · validation · API client · error handling. **Next build:** UI primitives → layout shell (Header/Ticker/Rail/Footer) → Home → catalog/Datasheet → AI → commerce → admin.

## NEXT — v1.1 · Theme: "Retain & make prices sticky"
Price **alerts (قیمت‌سنج)** delivery + **daily digest** · **price charts** (history accrued) · **Excel/logo-image/print** exports · **WhatsApp/Telegram/Eitaa** hand-off + **price-bot** · «**قیمت ما vs قیمت پایه**» transparency · factory-vs-بنگاه levels · reviews + written guarantee · request/order status tracking.
**Exit:** measurable return-visit & repeat lift; rising organic share.

## LATER — v1.2 · Theme: "Loyalty & content moat"
**باشگاه پولادین** (tiers/benefits) + intent popup · **AI content engine** (auto news + daily blog at scale, editor-gated) · standalone **پروژه‌سنج** · buying guides + glossary · advanced admin analytics · supplier استعلام log.
**Exit:** active club cohort; content-driven organic growth.

## PHASE 2 — Web App · Theme: "Deeper, account-driven experience"
Buyer **dashboard** (saved projects, request history, alerts, club status) · deeper **AI memory** · operational dashboards · (additive on the same codebase/PWA).

## PHASE 3 — Mobile App · Theme: "In-pocket prices"
Native app on **Cafe Bazaar + Myket** (iOS later) reusing the APIs: price tables, ticker, AI advisor, **push price-alerts**, club.

## FUTURE BETS — Theme: "New margin & moats"
**Embedded credit/financing** (چک/LC/installments/BNPL) · **integrated logistics/freight** · **two-sided marketplace** (verified suppliers) · **price index «شاخص پولادین»** + data/API subscription · **export module** (EN/AR) · partner API/EDI · mill-certificate vault.

---

## Sequencing & dependencies
- **Charts** depend on accrued **price history** → that's why they're v1.1, not MVP.
- **Club/content scale** depend on traffic → v1.2.
- **Credit/marketplace/logistics** depend on trust + volume + ops maturity → Future.
- **Mobile app** reuses Phase-1/2 APIs → after the web app stabilizes.
- **Data/index** can start as a trust asset early and become a revenue line later.

## Release-contents ↔ Feature List
Maps to `product/feature-list.md` priority tags: **★ MVP** = Now · **➕ Add** = v1.1 · **◇ Future** = Later/Phase 2-3/Future. The feature list stays the backlog; this roadmap orders it.

*Poladin — اول مشورت، بعد خرید.*
