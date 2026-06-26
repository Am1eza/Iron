# Fooladno — MVP Definition
## Layer 2 · Product Design — Document 2 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `product/product-scope.md` (v1.0)
**Scope of this document:** Defines the **Minimum Viable Product** — the smallest launchable version of the Fooladno **website** that proves the core loop and is genuinely useful and differentiated. It states precisely what is **in the MVP**, what is **deferred (fast-follow)**, and what is **hard-excluded**, each with rationale and acceptance criteria.

---

## 1. MVP Goal & Hypotheses

**Goal:** Launch a trustworthy, fast, mobile-first site where a buyer can (a) see **live, admin-curated prices with guaranteed delivery times**, (b) get **grounded AI advice and estimates**, and (c) **submit a request that becomes a warm, context-rich lead** for the sales team — with an **admin panel** fast enough to keep prices fresh daily.

**Hypotheses we validate with the MVP:**
1. **Magnet:** A live ticker + transparent prices make casual visitors (e.g., dollar-checkers) stay and return.
2. **Differentiation:** A grounded AI advisor that *consults before quoting* meaningfully outperforms plain price-list competitors.
3. **Conversion:** Buyers will submit requests (lead-gen) when the path is fast and the پیش‌فاکتور feels professional — without online payment.
4. **Operability:** A small team can keep prices fresh daily through a fast manual admin.

**Out of MVP intentionally** — anything not required to test these four hypotheses is deferred.

---

## 2. MVP Success Criteria
- Admin can build the catalog and **publish all daily prices in minutes**; ≥95% of active SKUs show "updated today."
- A visitor can find a price (via tables **or** AI) and see **قیمت + نوسان + زمان تحویل + last-updated** in < 1 minute.
- The AI **never states an ungrounded number**; when data is missing it offers a callback and creates a lead.
- A request reliably produces a **پیش‌فاکتور PDF + SMS + a CRM lead with full context**.
- Core price pages are **indexable** (SEO) and load fast on mobile.

---

## 3. The MVP Core Loop (end-to-end)

```
نبض بازار ticker / SEO price page  ──►  Visitor lands
                                         │
                 ┌───────────────────────┴───────────────────────┐
            Fast path (Pro)                                  Guided path (Builder)
        Right-side category rail                          AI hero «فولادنو»
        → price table (قیمت/نوسان/تحویل)                  → asks intent → estimates
                 └───────────────────────┬───────────────────────┘
                                  «ثبت درخواست»
                                         │
                        Phone + OTP → پیش‌فاکتور PDF → SMS
                                         │
                          CRM lead (full context) → Sales calls → close (offline)
```
Admin keeps the prices/ticker that feed this loop fresh every day.

---

## 4. MVP Scope — IN (modules + acceptance criteria)

### M1 · Admin: Catalog & Price Management — *the spine, build first*
**Includes**
- Secure admin login (OTP to whitelisted admin numbers); roles: **Super Admin** + **Price Operator**.
- Manage **7 main categories** + sub-categories + **SKUs** with specs (standard, size, grade, factory, theoretical weight).
- **Daily price-entry grid:** all active SKUs in one screen; enter **price + زمان تحویل**; **نوسان auto-computed** vs previous; **price-history appended**; **last-updated** stamp; **stale flag** (not updated today); **mobile-friendly**; speed helpers (copy-yesterday, ±%).
- **Billet** ticker value entry.
- Basic **audit log** (who changed which price, when).

**Acceptance**
- [ ] Operator creates a full category→sub→SKU tree.
- [ ] Operator updates every active SKU's price + delivery time from one screen; نوسان and history update automatically.
- [ ] SKUs not updated today are visibly flagged; a stale price never shows publicly without a visible old-date stamp.
- [ ] All price changes are logged with user + timestamp.

### M2 · Public Catalog & Price Tables
**Includes**
- The **7 categories** (میلگرد · تیرآهن · پروفیل · ورق گرم · ورق سرد · نبشی و ناودانی · لوله) + sub-categories.
- **Fixed right-side category rail**: name **flips to image on hover**; **click → price table**.
- **Price table columns:** استاندارد · وزن · قیمت · نوسان · تاریخ · **زمان تحویل** · actions.
- **MVP row actions:** **افزودن به علاقه‌مندی‌ها** + **ثبت درخواست**.
- **last-updated** stamp on every table; RTL, Toman, Persian digits, tabular numerals.
- **Indexable per-category/SKU pages** for SEO.

**Acceptance**
- [ ] Visitor browses all 7 categories and sub-categories; rail hover-flip and click-to-table work on desktop + mobile.
- [ ] Tables show قیمت/نوسان/زمان تحویل + last-updated, correctly formatted (RTL/Toman/Persian digits).
- [ ] Price pages are server-rendered and indexable; sitemap includes them.

### M3 · نبض بازار Ticker
**Includes**
- Top ribbon: **USD, EUR, gold (Iran), global ounce** from **tgju.org**; **billet** from admin. Up/down color + arrow; auto-refresh.

**Acceptance**
- [ ] Ticker displays current values; FX/gold/ounce pull from tgju; billet reflects admin entry.
- [ ] Direction arrows/colors derive from recent history; graceful fallback if tgju is unreachable (last-known value + subtle stale indicator).

### M4 · AI Advisor «فولادنو» (focused MVP)
**Includes**
- **Central AI hero** on home + reachable site-wide; greeting, **clearly an AI**, **suggested-question chips**.
- **Intent-first**: asks purpose before quoting (e.g., «برای چه کاری؟»).
- **Grounded tools:** `getPrice` (DB), `calcWeight` (وزن‌سنج), `estimateProject` (basic, coefficient-based), `createLead`.
- Produces a **structured quote/BOM** (items + weight + cost) that can become a lead.
- **DeepSeek server-side** via the out-of-Iran relay; **streaming**; **number-validation guardrail** (every stated number must match a tool result); **callback fallback** when data is missing.
- Persian voice per the brand book.

**Acceptance**
- [ ] Asked a bare price, the AI asks intent first, then gathers needs and returns a **grounded** price + weight + basic estimate.
- [ ] The AI never outputs a price/weight not returned by a tool (validated); on missing data it creates a lead and promises a callback.
- [ ] A completed conversation can be turned into a پیش‌فاکتور/lead in one step.

> *Note:* the **standalone, polished پروژه‌سنج page** is fast-follow; MVP delivers project estimation **inside the AI** only. Estimation coefficients must be sourced & verified (dependency §11).

### M5 · Lead & Quote Engine
**Includes**
- **«ثبت درخواست»** from any table row **or** AI quote → capture **name + phone** → **OTP verify** → generate **پیش‌فاکتور PDF (logo header, tabular numerals)** → **send via SMS (Kavenegar)** → create **CRM lead** with full context (items, weights, AI conversation, source page).
- **Admin CRM list:** leads with context, **status** (new / contacted / won / lost), assignment, notes.
- Customer sees confirmation + status message ("کارشناس تماس می‌گیرد").

**Acceptance**
- [ ] A request produces a پیش‌فاکتور PDF + an SMS to the buyer + a CRM lead visible to Sales with full context.
- [ ] Sales can change lead status and add notes; nothing requires online payment.

### M6 · وزن‌سنج Weight Calculator
**Includes**
- Standalone page **and** embedded in the AI; computes weight by product/size/quantity using **verified markazeahan formulas**.

**Acceptance**
- [ ] Weights match verified reference values across all 7 categories; same engine powers the AI's `calcWeight`.

### M7 · Marketing & Trust Pages (lightweight)
**Includes**
- **Home** (AI hero + ticker + category entry + trust strip + a few featured prices).
- **چرا فولادنو** (Why us).
- **تأمین‌کنندگان** (mill logos) + **مشتریان** (customer logos) — at minimum a home trust strip + an about section.
- **درباره ما / تماس با ما** with the real address + phones (map optional).
- **همکاری با ما** — one page with a **cooperation lead form** carrying a type selector (تحلیل بازار / تأمین از شما / فروش از ما) → CRM.
- Footer: eNamad/Samandehi placeholders, channels, contact.

**Acceptance**
- [ ] Trust elements (logos, real contact info, badges placeholders) present and correct.
- [ ] Cooperation form submissions create CRM leads tagged by type.

### M8 · Accounts (minimal)
**Includes**
- **Mobile + OTP** registration/login; minimal profile; **favorites** list; **request history**.

**Acceptance**
- [ ] User logs in via OTP; sees their favorites and past requests.

### M9 · Non-Functional Baseline
**Includes**
- **Localization:** full RTL, Jalali, Toman, Persian digits, tabular numerals.
- **SEO:** SSR/indexable price & page routes, sitemap, schema.org, metadata, clean per-SKU URLs.
- **Performance:** mobile-first speed; instant-feeling ticker; streaming AI.
- **Security:** OTP auth, role-based admin, price-freshness safeguards, AI number-validation, careful phone/lead handling, audit log.
- **Responsiveness:** fully responsive (PWA install = fast-follow).
- **Analytics:** basic funnel events (price views, AI sessions, leads, favorites).
- **Hosting:** hybrid — app/DB in Iran, DeepSeek via out-of-Iran relay.

**Acceptance**
- [ ] Site is correct in RTL/Jalali/Toman on mobile + desktop; core pages indexable; AA contrast per brand; key funnel events tracked.

---

## 5. Deferred — Fast-Follow (not in MVP, prioritized)

| When | Feature | Why deferred |
|---|---|---|
| **v1.1** | **Price alerts (قیمت‌سنج)** | High value, but not needed to prove the core loop; add once traffic exists. |
| **v1.1** | **Price charts** in tables | Needs accumulated **price history**, which barely exists at launch. |
| **v1.1** | **Excel / logo-image / print** table exports | Enhancements, not core; quick to add post-launch. |
| **v1.1** | **WhatsApp / Telegram / Eitaa** hand-off + price channels | SMS covers MVP; messaging channels are additive. |
| **v1.2** | **Customer club (باشگاه فولادنو)** + intent popup | Needs benefit machinery & tiers; not required to validate hypotheses. |
| **v1.2** | **AI content engine** (auto news + daily blog) | Heavy; SEO can start with a few manual articles; automate later with editor approval. |
| **v1.2** | **Standalone پروژه‌سنج** polished tool | MVP delivers estimation inside the AI; standalone UI is a follow-up. |
| **v1.2** | **«قیمت ما vs قیمت پایه»** transparency surface | Valuable differentiator; needs reference-price data plumbing. |
| **v1.2** | **Full «همکاری با ما» 3-track pages** + advanced admin analytics | MVP uses one form; expand later. |
| **Phase 2** | **Web App** dashboard (saved projects, deeper AI memory) | Post-MVP, additive on same codebase. |
| **Phase 3** | **Mobile app** (Cafe Bazaar/Myket) + push alerts | Separate phase; reuses MVP APIs. |

---

## 6. Hard Out-of-MVP (excluded by scope §7)
Online payment/checkout · two-sided marketplace/sellers · auctions/live bourse trading · multi-language/multi-currency · native apps · fully-autonomous AI publishing · ERP/accounting integration.

---

## 7. MVP Data Scope (minimum entities)
Catalog (categories, sub-categories, SKUs, specs) · Prices (current + **delivery time** + **history** + computed نوسان) · Ticker values (tgju FX/gold/ounce + admin billet, with history) · Leads/quotes (request, پیش‌فاکتور, status, context) · Users (account, favorites, request history) · Brand assets (mill + customer logos) · Ops (roles, audit log, analytics events).
*(Club, alerts, blog content = deferred entities.)*

---

## 8. MVP Integrations
- **DeepSeek** (server-side, via out-of-Iran relay, swappable adapter, fallback).
- **tgju.org** (FX/gold/ounce ticker values).
- **Kavenegar** (SMS — OTP, پیش‌فاکتور link/notice, lead notifications).
- **Web analytics** (privacy-respecting).
*(Messaging channels, payment = later.)*

---

## 9. Suggested Build Milestones (sequence)
1. **Foundations** — repo, stack, RTL/Jalali/Toman base, auth (OTP), roles.
2. **M1 Admin + catalog + pricing** — the spine; gives us real data.
3. **M2 Public tables + rail + SEO pages** — prices visible.
4. **M3 Ticker** (tgju + billet).
5. **M6 Weight engine** (used by AI).
6. **M4 AI advisor** (grounded tools + relay + guardrails).
7. **M5 Lead/quote engine** (پیش‌فاکتور + SMS + CRM).
8. **M7 Marketing/trust pages** + **M8 accounts**.
9. **M9 hardening** — SEO, performance, security, analytics, QA.
10. **Launch** (Definition of Done below).

---

## 10. Definition of Done — Launch Checklist
- [ ] Catalog populated; daily price + delivery-time entry working; stale-flagging on; history recording.
- [ ] Public price tables live, accurate, RTL/Toman/Persian-digits, last-updated visible, indexable.
- [ ] Ticker live (tgju + billet) with graceful fallback.
- [ ] AI advisor grounded (no ungrounded numbers), intent-first, streaming, callback fallback.
- [ ] Lead engine end-to-end: ثبت درخواست → OTP → پیش‌فاکتور PDF → SMS → CRM lead with context.
- [ ] Weight calculator verified accurate.
- [ ] Marketing/trust pages + correct address/phones + cooperation form → CRM.
- [ ] OTP accounts: favorites + request history.
- [ ] SEO (sitemap/schema/SSR), performance, AA contrast, security (roles/audit), analytics events.
- [ ] Brand applied per brand book; mobile-first verified.

---

## 11. Assumptions, Dependencies & Risks
**Assumptions:** a small team operates the admin daily; mills/customers permit logo use; DeepSeek reachable via the relay.
**Dependencies:** verified **markazeahan weight formulas** (وزن‌سنج); verified **engineering coefficients** (AI estimate accuracy); tgju data access method; Kavenegar account; DeepSeek credentials + hosting; final logo (pending).
**Risks (MVP-specific):** AI accuracy (→ tool-grounding + validation + callback); daily price-entry burden (→ fast grid + stale flags); tgju/DeepSeek reachability (→ fallbacks + relay); SEO ramp (→ strong technical SEO from day one).

---

## 12. Boundary calls worth your confirmation
A few items sit right on the MVP line — tell me if you want any **pulled into MVP**:
- **Price charts** (deferred — little history at launch).
- **Excel / logo-image / print** exports (deferred — enhancements).
- **Standalone پروژه‌سنج** (deferred — estimation is in the AI for MVP).
- **Customer club** & **AI blog automation** (deferred to v1.2).

*Next Layer-2 document after MVP approval: Information Architecture & Sitemap.*

*Fooladno — اول مشورت، بعد خرید.*
