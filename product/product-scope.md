# Ahantime — Product Scope
## Layer 2 · Product Design — Document 1 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Scope of this document:** Defines *what* the Ahantime product is and is not — its objectives, users, platforms, capability areas (in-scope), explicit exclusions (out-of-scope), data, integrations, constraints, and release phasing. It is the boundary-setting document; detailed feature specs, flows, and the data model follow in later Layer-2 documents.

---

## 1. Product Definition

**Ahantime (آهن‌تایم)** is a **smart iron & steel marketplace** for the Iranian market. It combines four things no single Iranian competitor does well together:

1. A **grounded AI advisor** that consults before it quotes — helping buyers decide, estimate, and plan.
2. **Transparent, live, admin-curated prices** with a signature **guaranteed delivery time (زمان تحویل تضمینی)**.
3. A **retention engine** (live market ticker, alerts, content, club) that turns casual price-checkers into qualified leads.
4. A **traditional, human-closed sales flow** modernized end-to-end — the website does everything up to the handshake; the sales team closes by phone, fully armed with context.

Sales are **lead-generation based**: there is **no online payment/checkout** in the current scope. The product's job is to **attract → engage → capture qualified demand**, then hand a warm, fully-contextualized lead to human sales.

**Delivery phases:** **Website first** (this scope's primary focus), then **Web App**, then **Mobile App**. All the capabilities below are scoped for the **Website (Phase 1)** unless a phase is noted.

---

## 2. Product Goals & Success Criteria

### Business goals
- Become the most **trusted and modern** iron/steel buying destination in Iran.
- Generate a steady flow of **qualified, context-rich leads** to the sales team.
- Build a **retained audience** (returning price-checkers, club members, alert subscribers).
- Win **organic search** for قیمت آهن / قیمت میلگرد / قیمت تیرآهن … (SEO is the category's lifeblood).

### Product goals
- Make a stranger who came only to "check the dollar" **stay several minutes** and return.
- Let any buyer get a **price, a weight, and a project estimate** in under a minute.
- Make the AI feel like a **knowledgeable, honest advisor** — never a hype machine, never wrong on a number.
- Give the admin a **fast, mistake-proof** way to publish manual prices daily.

### Success metrics (initial KPIs)
- **Acquisition:** organic sessions; ticker/price-page entries.
- **Engagement:** avg. session duration; AI conversations started/completed; tables viewed; tools used.
- **Capture:** leads created (ثبت درخواست), alerts set, club sign-ups, phone reveals/WhatsApp hand-offs.
- **Conversion (offline):** lead → sales-qualified → won (tracked in the CRM).
- **Retention:** returning visitors; alert open rates; club active members.
- **Operations:** price-freshness (% SKUs updated today), time-to-publish daily prices.

---

## 3. Scope Principles (the rules that bound every decision)

1. **Funnel, not brochure.** Every feature must serve one stage: **Magnet → Engage → Capture → Convert → Retain.**
2. **Dual-mode.** The **AI hero** serves newcomers/retail; the **fast price tables** serve pros. Neither is forced through the other.
3. **Grounded AI.** The AI **talks**; deterministic code **decides every number** (prices from the DB, weights from formulas). It never invents a price; if data is missing/stale it offers a callback and creates a lead.
4. **Traditional close, modern path.** No online payment in scope; lead-gen + پیش‌فاکتور + human follow-up.
5. **Admin is the spine.** All prices, delivery times, ticker values, and most data are **admin-entered**; the admin panel is a first-class product, not an afterthought.
6. **Mobile-first, RTL-first, Persian-first.** Designed for Iranian mobile users; Jalali dates, Toman, Persian digits.
7. **Trust is a feature.** eNamad/اتحادیه/mill logos, real identity, last-updated stamps, and price-transparency are in scope as product surfaces.

---

## 4. Platforms & Release Phasing

| Phase | Platform | Scope summary |
|---|---|---|
| **Phase 1 (current focus)** | **Website (responsive PWA, RTL)** | The full capability set in §6 — public site, catalog & price tables, AI advisor, ticker, tools, lead/quote engine, alerts, club, content engine, accounts, and the admin panel. |
| **Phase 2** | **Web App** | A richer authenticated experience built on Phase 1: buyer dashboard (saved projects, request history, alerts, club status), deeper AI memory, and operational dashboards. Mostly *additive* — same codebase/PWA, more app-like. |
| **Phase 3** | **Mobile App (Android first — Cafe Bazaar + Myket; iOS later)** | Native/hybrid app reusing Phase-1/2 APIs: price tables, ticker, AI advisor, push price-alerts, club. (Google Play is not the primary channel in Iran.) |

> This document scopes **Phase 1 (Website)** in full and outlines Phases 2–3 at a high level so the architecture is built to extend, not rebuild.

---

## 5. Users & Roles

### External users
- **Visitor (guest):** browses prices, uses the AI, ticker, tools, content. No account needed to look.
- **Registered user:** has an account; can save favorites, set price alerts, view request history, manage profile.
- **Club member (باشگاه آهن‌تایم):** a registered user enrolled in the loyalty club; receives tiered benefits.

### Internal users (admin panel)
- **Super Admin:** full access; manages users/roles and settings.
- **Price Operator:** the daily price-entry role — fast price/delivery-time updates, ticker values. (Separable from full admin.)
- **Sales / CRM Agent:** works the leads/requests pipeline; sees full lead context; logs outcomes.
- **Content Editor:** reviews/approves/publishes AI-drafted news & blog; manages SEO.
- **Catalog Manager:** manages categories, sub-categories, SKUs, specs, partner/customer logos.

*(Roles can be combined for a small team; the permission model must support granular role assignment.)*

---

## 6. In-Scope Capabilities (Phase 1 — Website)

Grouped into product modules. Each is in-scope; detailed specs come in later Layer-2 docs.

### A. Public / Marketing Site
- **Landing/home** centered on the **AI search hero** with the **نبض بازار ticker** above it.
- **«چرا آهن‌تایم؟» (Why us)** — competitive advantages (cheaper, faster, AI advisor, transparent prices, guaranteed delivery, expert support).
- **«تأمین‌کنندگان ما» (Who we work with)** — producer/mill logos (فولاد مبارکه، ذوب آهن، …).
- **«مشتریان ما» / اعتماد (Who trusts us)** — customer logos / trust wall.
- **درباره ما (About)** + **تماس با ما (Contact)** with the real address & phones:
  - تهران، اقدسیه، خیابان موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، طبقه چهارم، واحد ۷
  - تلفن ثابت: ۰۲۱۲۶۲۹۷۵۱۲ · همراه: ۰۹۱۲۱۳۹۵۹۵۴
- **«همکاری با ما» (Work with us)** hub with three tracks: **تحلیل بازار** (market analysis), **تأمین از شما** (we source from you / sellers), **فروش از ما** (buy from us / partners). Each = an intro + a lead form into the CRM.
- **Trust/legal footer:** eNamad/Samandehi placeholders, اتحادیه, contact, social/channel links.

### B. Product Catalog & Price Tables
- **Seven main categories:** میلگرد · تیرآهن · پروفیل · ورق گرم · ورق سرد · نبشی و ناودانی · لوله — each expanding into **sub-categories** (by type/standard, size, grade, producing factory), structured comprehensively (benchmarked on ahanprice.com, but improved).
- **Fixed right-side category rail:** category names pinned on the right; on **hover the name flips to the category image**; on **click → the price table** opens.
- **Price table columns:** استاندارد · وزن · **قیمت** · **نوسان** · تاریخ · **زمان تحویل** (our innovation) · actions.
- **Row/table actions:** add to **علاقه‌مندی‌ها (favorites)** · **چارت (price chart over selectable time ranges)** · **دانلود اکسل** · **دریافت تصویر جدول با سربرگ و لوگو** · **پرینت**.
- **Price freshness:** every table shows a **last-updated timestamp**; stale prices are flagged internally.
- **Price history:** time-series captured per SKU to power charts and نوسان.
- **Differentiator surface (optional, high-value):** «قیمت ما در کنار قیمت پایه» transparency where data allows.

### C. AI Advisor — «آهن‌تایم»
- **Central AI search hero** ("سلام، من آهن‌تایمم. چه محصولی می‌خواید بخرید؟") — **clearly an AI**, with greeting and suggested-question chips.
- **Intent-first behavior:** when asked a price, it **asks the purpose first** (e.g., "برای چه کاری؟"), then helps with **project cost estimate, total cost of requested items, and weight estimate**, plus expert guidance and **proactive suggested questions**.
- **Grounded via tools:** `getPrice` (from DB), `calcWeight` (وزن‌سنج formulas), `estimateProject` (پروژه‌سنج), `createLead` (CRM). Never invents numbers; offers a callback when data is missing.
- **Outputs a structured result** (a BOM / پیش‌فاکتور draft) that flows into the cart and the CRM as a qualified lead.
- **Streaming replies, session memory**, Persian voice matching the brand tone.
- Powered by **DeepSeek (server-side)** behind a model-adapter abstraction (swappable later).

### D. Market Data — «نبض بازار» (ticker)
- A **moving ribbon above the AI hero** showing: **gold price (Iran)**, **global ounce**, **USD**, **EUR**, **steel billet (شمش فولاد)** — each with up/down color + arrow.
- **FX, gold (Iran), and the global ounce are auto-fetched from tgju.org;** the **steel billet (شمش فولاد) stays admin-entered.** Up/down color + arrows derive from each value's recent history.
- The ticker is the **primary magnet** for the "just checking the dollar" audience and a hook into alerts.

### E. Lead & Quote Engine (traditional sales, no payment)
- **«ثبت درخواست / دریافت پیش‌فاکتور»** from any table row or AI quote.
- Captures **name + phone** (or uses the logged-in account); generates a **پیش‌فاکتور PDF with logo/header**.
- **Delivers the پیش‌فاکتور via SMS / WhatsApp**, and creates a **warm CRM lead** with full context (browsing history, AI conversation, BOM, weights).
- **Callback handling** ("الان/ساعت X تماس بگیرید") and **«ادامه در واتساپ/تلگرام»** hand-off carrying cart context.
- Lead status visible to the customer; pipeline visible to Sales in admin.
- **No online payment, no checkout completion** in scope (architecture leaves room to add درگاه later).

### F. Price Alerts — «قیمت‌سنج» (capture mechanism)
- Any ticker value or table SKU can become an **alert** ("notify me when میلگرد drops below X / dollar hits Y").
- Requires identity (phone/account) — converting passive price-checkers into leads.
- Delivered via **SMS / Telegram / WhatsApp / Eitaa** (channel set in §10).

### G. Customer Club — «باشگاه آهن‌تایم»
- Tiered membership (**آهن → فولاد → پولاد**) with concrete benefits (locked prices, priority delivery, dedicated advisor, exclusive alerts/content).
- **Intent-timed join popup** (after a quote or alert — not an annoying on-load interrupt).
- Member benefits, status, and history surfaced in the account.

### H. Content Engine — News & Blog (with AI automation)
- **News & Blog** sections (market news + educational/SEO articles).
- **AI automation** drafts relevant market news and a **daily blog post**, grounded in admin price data + a market feed.
- **Editorial guardrail:** **AI drafts → editor approves → publishes** (no fully-autonomous publishing at launch, to protect accuracy & SEO).
- Full **SEO scaffolding:** per-article/per-SKU URLs, metadata, schema, sitemap, internal linking.

### I. Tools
- **وزن‌سنج (Weight Calculator):** computes weight by product/size/quantity using **markazeahan.com formulas** (deterministic). Standalone page **and** embedded in tables & the AI.
- **پروژه‌سنج (Project Estimator):** gathers project inputs (متراژ، طبقات، نوع سازه) → estimates material list, weight & cost; powered by engineering coefficients + `getPrice`. Surfaced both standalone and inside the AI.

### J. Admin Panel (first-class, critical)
- **Daily price entry dashboard:** all SKUs in one fast grid; enter new **price + زمان تحویل**; **نوسان auto-computed**; **price history auto-appended**; **stale-price (not-updated-today) flagging**; mobile-friendly for entry after استعلام calls; speed helpers (copy yesterday, ±%); **scheduled publish**.
- **Ticker management:** enter/update gold/USD/EUR/ounce/billet and any admin-managed market values.
- **Catalog management:** categories, sub-categories, SKUs, specs, standards, images/icons.
- **Lead / CRM pipeline:** view and work requests with full context; statuses; assignment; outcome logging.
- **Content management:** review/approve/schedule AI-drafted news & blog; SEO fields.
- **Club management:** tiers, members, benefits.
- **Brand assets:** partner (mill) logos and customer logos.
- **Users & roles:** granular permissions; audit log.
- **Settings & analytics:** site settings, channel configs, basic dashboards (prices freshness, leads, traffic).

### K. Accounts & Profiles
- Registration/login (phone/OTP-centric, fitting Iran); profile; favorites; alerts; request history; club status.

### L. Notifications & Channels
- **SMS** (Iranian gateway) for OTP, پیش‌فاکتور, alerts, callbacks.
- **WhatsApp / Telegram / Eitaa** for quote hand-off, alerts, and price channels.

---

## 7. Out-of-Scope (explicitly excluded for now)
To keep Phase 1 focused, the following are **not** in scope (may be revisited later):
- **Online payment / درگاه پرداخت and checkout completion** — sales stay traditional/human-closed.
- **Self-serve order fulfillment, shipping/logistics booking, returns** — handled offline by sales.
- **Two-sided open marketplace / third-party sellers** — Ahantime curates its own catalog/prices (the «تأمین از شما» track is a lead form, not a seller portal, in Phase 1).
- **Real-time exchange/auction or live bourse trading.**
- **Multi-currency / multi-language storefront** — Persian/Toman only at launch (English logo/app-store text aside).
- **Native mobile apps** — Phase 3, not Phase 1.
- **Fully-autonomous AI publishing** without human approval.
- **ERP/accounting integration** — out of scope for Phase 1 (CRM lead export only).

---

## 8. Data Scope (entities the system owns)
- **Catalog:** categories, sub-categories, SKUs, specs/standards, images.
- **Pricing:** current price + **delivery time** per SKU, **price history (time-series)**, computed نوسان.
- **Market data:** ticker values (gold, ounce, USD, EUR, billet, …) + their history.
- **Leads / quotes:** requests, پیش‌فاکتور documents, status, context, assignment.
- **Users:** accounts, profiles, favorites, alerts, request history.
- **Club:** members, tiers, benefits, activity.
- **Content:** news & blog posts, drafts, SEO metadata.
- **Brand assets:** partner (mill) and customer logos.
- **Operations:** roles/permissions, audit logs, settings, analytics events.

---

## 9. Integrations Scope
- **DeepSeek API** — server-side, via a swappable **model-adapter** (with fallback handling).
- **SMS gateway** — **Kavenegar (recommended)** or SMS.ir — OTP, پیش‌فاکتور, alerts.
- **Messaging** — WhatsApp / Telegram / Eitaa (hand-off, alerts, channels).
- **tgju.org** — source for ticker FX / gold / global-ounce values (integration method — API or scheduled fetch — set in tech design); billet stays admin-entered.
- **Trust** — eNamad / Samandehi badges.
- **Analytics** — privacy-respecting web analytics.
- **(Later) Payment gateway** — architecture leaves a clean seam.

---

## 10. Non-Functional Scope
- **Localization:** full **RTL**, **Persian-first**, **Jalali calendar**, **Toman**, Persian digits; tabular numerals in tables.
- **SEO:** server-rendered/indexable pages, per-SKU & per-article URLs, schema.org, sitemap, fast loads — **first-class** (primary acquisition channel).
- **Performance:** mobile-first speed budgets; the ticker/AI must feel instant; streaming AI.
- **Reliability/Accuracy:** **price freshness** safeguards (stale flags); AI grounding guarantees (no invented numbers); pre-publish validation of AI numbers.
- **Security & privacy:** OTP auth, role-based admin access, audit logs, careful handling of phone numbers/leads.
- **Accessibility:** WCAG AA color/contrast (per brand book), keyboard/screen-reader basics.
- **PWA / mobile:** installable, responsive, offline-tolerant where sensible — easing the path to Phase 3.
- **Browser/device support:** modern mobile + desktop browsers common in Iran.

---

## 11. Constraints, Assumptions & Open Decisions

### Constraints (fixed)
- **No payment gateway** in Phase 1 — lead-gen + human close.
- **Prices are 100% manual** (admin calls استعلام, enters by hand). **No price formula** (bourse-derived pricing does not apply). *(Weight is the exception — weight uses deterministic formulas.)*
- **AI runs server-side via DeepSeek** (Iran/sanctions reality); model access must be reliable + abstracted, routed through the out-of-Iran relay (see §11 hosting decision).
- **Persian-first, RTL, Toman, Jalali.**

### Assumptions
- A small internal team operates the admin daily (price operator + sales + editor roles).
- Mills/customers will permit logo usage for the trust walls.
- DeepSeek API is reachable from the chosen server environment.

### Resolved decisions (locked 26 June 2026)
1. **Ticker FX/gold:** auto-fetched from **tgju.org** (USD, EUR, gold-Iran, global ounce); **steel billet remains admin-entered.**
2. **Hosting:** **hybrid / split** — the main app + database run **inside Iran** (fast for users, domestic SMS/services), while **AI (DeepSeek) and any sanctioned calls are routed through a server-side relay hosted outside Iran.** Keeps users fast and the AI reliably reachable.
3. **SMS provider:** **Kavenegar (recommended)** for OTP/پیش‌فاکتور/alerts (strong API, reliable); SMS.ir as alternative — final pick at tech-stack stage.
4. **Auth:** **mobile number + OTP** (no email/password at launch).
5. **«تأمین از شما»:** Phase 1 = a **simple lead/intake form** into the CRM (not a seller portal); expandable later.
6. **Web App (Phase 2):** confirmed **additive on the same codebase / PWA**, not a separate build.

---

## 12. Dependencies
- Brand assets (logo finalization pending your decision; brand book v1.0 complete).
- markazeahan weight formulas (to be extracted & verified for وزن‌سنج).
- Engineering coefficients for پروژه‌سنج (to be sourced & verified for estimate accuracy).
- Mill/customer logo permissions.
- DeepSeek API credentials + chosen hosting.

---

## 13. Key Risks (tracked early)
- **AI accuracy/trust** — mitigated by tool-grounding + number validation + callback fallback.
- **Daily price-entry burden** — mitigated by a fast, mistake-proof admin grid + stale-flagging.
- **AI/API reachability from Iran** — mitigated by server-side adapter + fallback + hosting decision.
- **SEO competitiveness** — mitigated by strong technical SEO + the content engine.
- **Scope creep** (toward payments/marketplace) — controlled by §7.

---

*Next Layer-2 documents (after this scope is approved): Information Architecture & Sitemap → Core User Flows → Data Model → Feature Specs (module by module) → Admin Spec → AI Advisor Spec.*

*Ahantime — اول مشورت، بعد خرید.*
