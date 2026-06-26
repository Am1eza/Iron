# Fooladno — User Prioritization
## Layer 2 · Product Design — Document 4 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `product-scope.md`, `mvp.md`, `feature-list.md`
**Purpose:** Identify every user of Fooladno, **prioritize them with a transparent framework**, and translate that ranking into design rules — i.e., *whose needs win* when they conflict. This document governs the next artifacts (IA, flows, UI).

---

## 1. Why this matters
Fooladno serves very different people: a contractor who wants a price in 2 seconds, a first-time home-builder who needs hand-holding, a trader who checks prices ten times a day, and a curious visitor who just wants the dollar rate. Designing for "everyone" means designing for no one. This document sets a **defensible priority order** so the product has a clear primary owner at every screen — while still serving the rest.

> **Founder direction honored:** you stated the **Contractor (B2B)** and the **Individual Builder (retail)** are *both* primary. We treat them as **co-primary (Tier 1)**, resolved through the **dual-mode** design (AI hero for the Builder, fast price tables for the Pro). The framework below adds the rigor and shows where each leads.

---

## 2. Methodology — prioritization framework

Each external segment is scored **1–5** on six weighted criteria; the weighted total drives the tier. We then apply a **strategic override** where the brand's differentiator (the AI advisor) or founder direction justifies elevating a segment.

| Criterion | Weight | Meaning |
|---|---|---|
| **Revenue / lead value** | 25% | Ticket size, margin, value of the lead |
| **Volume / reach** | 20% | How many they are; traffic they bring |
| **Conversion likelihood** | 20% | Lead → sale probability |
| **Strategic fit** | 15% | Alignment with our differentiators (AI advisor, transparency, delivery-time) |
| **Frequency / retention** | 10% | How often they return |
| **Influence** | 10% | Do they drive others' purchase decisions |

---

## 3. The User Landscape (all segments)

**External (visitors/buyers)**
1. **Contractor / Pro — «پیمانکار»**
2. **Individual Builder — «سازندهٔ شخصی»** (home builder / renovator, incl. NRIs/diaspora)
3. **Trader / Reseller — «بنگاه‌دار / واسطه»**
4. **Industrial / Manufacturer buyer — «خریدار صنعتی/تولیدی»**
5. **Engineer / Architect — «مهندس/معمار»** (influencer/spec-writer)
6. **Casual Price-Checker — «بازدیدکنندهٔ کنجکاو»** (came for dollar/gold/price)
7. **Supplier / Seller — «تأمین‌کننده»** (wants to sell to/through us — «تأمین از شما»)
8. **Export buyer — «خریدار صادراتی»** (future)

**Internal (operate the product)**
- **Price Operator**, **Sales / CRM Agent**, **Content Editor**, **Catalog Manager**, **Super Admin**.

---

## 4. Personas (detailed)

### P1 · رضا — Contractor / پیمانکار  *(Tier 1, co-primary)*
- **Context:** Runs building projects; buys rebar/beams/profiles by the ton, often weekly; cash-flow tight; buys on credit (چک/LC).
- **Goals:** Get today's accurate price + delivery time fast; lock a price; get a پیش‌فاکتور; reliable on-time delivery.
- **Frustrations (today):** Has to phone around; opaque markups; prices change intraday; no clear delivery timing.
- **Entry mode:** **Fast lane** — right-side category rail → price tables → inquiry cart → پیش‌فاکتور. Uses AI for quick lookups.
- **Key features:** price tables, زمان تحویل, نوسان, inquiry cart, پیش‌فاکتور/SMS, credit options, alerts, reorder.
- **Success:** "Priced and requested 12 tons of rebar in two minutes, with a delivery date."
- **Device:** mobile-first, on-site.

### P2 · آقای کریمی — Individual Builder / سازندهٔ شخصی  *(Tier 1, co-primary)*
- **Context:** Building/renovating one home; buys once or twice; doesn't know steel grades or quantities; afraid of being overcharged.
- **Goals:** Understand what to buy, how much, and the total cost; trust the seller.
- **Frustrations (today):** Jargon; no guidance; fear of cheating; can't estimate quantities.
- **Entry mode:** **Guided lane** — AI advisor «فولادنو» (intent-first) + پروژه‌سنج + وزن‌سنج.
- **Key features:** AI advisor, project estimator, weight calculator, trust signals, پیش‌فاکتور, buying guides.
- **Success:** "The AI estimated my rebar and beams for a 200 m² home and the cost — I felt safe ordering."
- **Device:** mobile, evenings.

### P3 · حسن — Trader / بنگاه‌دار  *(Tier 2, high score)*
- **Context:** Buys to resell; lives in the market; checks قیمت روز constantly; price-sensitive; may also be a supplier.
- **Goals:** Fast, reliable daily prices + history + alerts to time buys/sells.
- **Entry mode:** Tables + ticker + alerts; power user.
- **Key features:** price tables, charts/history, alerts (قیمت‌سنج), Excel export, compare, factory-vs-بنگاه, Telegram bot.
- **Note:** high **volume + frequency + SEO** value; some are competitors — serve, don't over-optimize ops for them.

### P4 · کارخانهٔ صنعتی — Industrial Buyer / خریدار صنعتی  *(Tier 2, high value)*
- **Context:** Manufacturer using steel as input (ورق/profile); recurring, spec-driven, larger tickets; procurement-led.
- **Goals:** Reliable supply, consistent specs/standards, certificates, bulk pricing, terms.
- **Key features:** spec/standard tables, mill certificates, bulk/B2B RFQ, credit, account/reorder, dedicated advisor.

### P5 · مهندس سارا — Engineer / Architect  *(Tier 2, influencer)*
- **Context:** Specs structures; doesn't always buy but **decides what's bought**.
- **Goals:** Accurate weights, standards (اشتال), estimates for planning.
- **Key features:** وزن‌سنج, پروژه‌سنج, standard reference tables, glossary, mill certs, content/guides.
- **Why prioritized:** high **influence** — winning the engineer wins the contractor's order.

### P6 · نازنین — Casual Price-Checker  *(Tier 2, strategic funnel)*
- **Context:** Came only to check **dollar/gold**; not buying steel today.
- **Goals:** A quick glance at FX/gold.
- **Entry mode:** نبض بازار ticker + «طلا و ارز» page.
- **Conversion path:** ticker → free tools/alerts → identity capture → future lead.
- **Why prioritized:** huge **volume + frequency + retention**; the top of our funnel. Low direct value, high pipeline value.

### P7 · تأمین‌کننده — Supplier / Seller  *(Tier 3)*
- **Context:** Wants to sell supply to/through Fooladno («تأمین از شما»).
- **Phase 1:** a simple intake/lead form. Not optimized further yet (marketplace = future).

### Internal personas
- **Price Operator (Tier-1 internal):** must publish all daily prices fast and accurately — the operational lifeline.
- **Sales / CRM Agent (Tier-1 internal):** converts warm leads; needs full context.
- **Content Editor / Catalog Manager / Super Admin (Tier-2 internal).**

---

## 5. Prioritization Scoring Matrix

*(scores 1–5; weighted total out of 5)*

| Segment | Revenue (25%) | Volume (20%) | Conversion (20%) | Strategic (15%) | Frequency (10%) | Influence (10%) | **Weighted** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **P1 Contractor** | 5 | 4 | 4 | 4 | 4 | 4 | **4.25** |
| **P3 Trader** | 4 | 5 | 3 | 3 | 5 | 3 | **3.85** |
| **P4 Industrial** | 5 | 2 | 4 | 3 | 3 | 3 | **3.50** |
| **P2 Builder** | 3 | 4 | 3 | 5 | 2 | 2 | **3.30** |
| **P5 Engineer** | 2 | 3 | 2 | 4 | 3 | 5 | **2.90** |
| **P6 Price-Checker** | 1 | 5 | 1 | 4 | 5 | 2 | **2.75** |
| **P7 Supplier** | 2 | 2 | 2 | 2 | 1 | 2 | **1.90** |

**Reading it honestly:** by pure weighted score, the revenue-and-volume segments (Contractor, Trader, Industrial) lead; the Builder ranks mid. **We deliberately elevate the Builder to co-primary** because (a) the **AI advisor — our core differentiator — exists primarily for them** (highest Strategic-fit, 5), and (b) per founder direction. This is a conscious strategic override, not an oversight.

---

## 6. Priority Tiers (the output)

### Tier 1 — Primary (design-for-first; their needs win)
- **P1 Contractor (پیمانکار)** — by score and revenue.
- **P2 Individual Builder (سازندهٔ شخصی)** — by strategy/differentiation + founder direction.
> Served via **dual-mode**: Builder → AI hero; Pro → fast price tables. **Neither is forced through the other.**

### Tier 2 — Secondary (fully supported, not the design lead)
- **P3 Trader** (volume/frequency/SEO engine — high score, key revenue), **P4 Industrial** (high value/low volume), **P5 Engineer** (influencer — winning them wins orders), **P6 Price-Checker** (the funnel's mouth — retention → leads).

### Tier 3 — Tertiary (served minimally in Phase 1)
- **P7 Supplier** (lead form now; marketplace later), **Export buyer** (future).

### Internal priority
1. **Price Operator** (ops lifeline) → 2. **Sales Agent** (revenue) → 3. Content/Catalog/Admin.

---

## 7. Conflict-Resolution Rules (the heart of this doc)

When two users' needs collide, resolve in this order:

1. **Never trade Pro speed for Builder hand-holding (or vice-versa)** → keep **two parallel paths** (dual-mode). The homepage exposes **both** the AI hero (Builder) and immediate price access / category rail (Pro) above the fold.
2. **Tier 1 beats Tier 2.** If a screen can't serve both, optimize for Contractor/Builder; give Tier-2 users a secondary route.
3. **Capture beats convert for Tier-2 funnel users.** For the Price-Checker, the goal is *retain + capture identity*, not push a sale.
4. **Trust is universal — never trade it away.** All tiers (especially the risk-averse Builder) need visible trust signals; these stay on every key screen.
5. **Internal ops are non-negotiable.** The Price Operator's fast, accurate workflow outranks any nice-to-have public feature — stale prices break trust for *everyone*.

---

## 8. Jobs-To-Be-Done (primary personas)

- **Contractor:** *"When I'm pricing/buying for a project, I want today's accurate prices, delivery time, and a quick پیش‌فاکتور, so I can bid and buy fast and reliably."*
- **Builder:** *"When I'm building my home and don't know steel, I want an expert to tell me what to buy, how much, and the total cost, so I order confidently without being cheated."*
- **Trader:** *"When I track the market daily, I want fast, reliable قیمت روز plus alerts, so I can time my buys and sells."*
- **Engineer:** *"When I spec a structure, I want correct weights, standards, and estimates, so I can plan accurately."*
- **Price-Checker:** *"When I check the dollar/gold, I want a quick glance — and I might discover I can buy steel here."*

---

## 9. Tier → Feature Mapping (link to `feature-list.md`)

| Tier / Persona | Lead features they live in |
|---|---|
| **Contractor (T1)** | Price tables (2.x), زمان تحویل (2.3), inquiry cart (2.16), پیش‌فاکتور/SMS (6.x), alerts (3.3), credit (6.13), reorder (6.9) |
| **Builder (T1)** | AI advisor (4.x), پروژه‌سنج (5.2), وزن‌سنج (5.1), trust (10.x), buying guides (9.6), پیش‌فاکتور (6.2) |
| **Trader (T2)** | Ticker (1.x), charts/history (3.1), alerts (3.3), export/compare (2.7/2.15), Telegram bot (11.6) |
| **Industrial (T2)** | Standards/certs (2.17/2.18), bulk RFQ (13.5), credit (6.13), account (7.x) |
| **Engineer (T2)** | وزن‌سنج, پروژه‌سنج, standards (2.18), glossary (9.7), certs (2.17) |
| **Price-Checker (T2)** | Ticker (1.1), «طلا و ارز» page (1.2), free tools (5.x), alerts (3.3) |
| **Supplier (T3)** | «تأمین از شما» form (13.2) |
| **Price Operator (internal)** | Admin price grid (12.1), bulk import (12.4), استعلام log (12.5) |
| **Sales Agent (internal)** | CRM pipeline (12.7), lead context, callback (6.5) |

---

## 10. Funnel × Persona (who we capture where)

| Funnel stage | Primary persona(s) | Mechanism |
|---|---|---|
| **Magnet** | Price-Checker, Trader | ticker, «طلا و ارز», SEO price pages, free tools |
| **Engage** | Builder, Pro, Engineer | AI advisor, price tables, estimators |
| **Capture** | All | favorites, alerts, OTP, ثبت درخواست, club popup |
| **Convert** | Contractor, Industrial, Builder | پیش‌فاکتور → CRM → human close |
| **Retain** | Trader, Contractor, Club members | alerts, digest, club, reorder, content |

---

## 11. Anti-Personas (we deliberately do **not** optimize for)
- **One-off micro-retail** (someone wanting a single small bracket/bolt) — we're structural-steel volumes, not a hardware shop.
- **Pure scrapers/competitors** harvesting prices — tolerated, never a design target.
- **Export buyers (now)** — deferred to a future module.
- **Anonymous bargain-only users with zero intent** — we capture them via the funnel but never reshape core UX around them.

---

## 12. Success Metrics by Primary Persona
- **Contractor:** time-to-پیش‌فاکتور; repeat request rate; alert adoption.
- **Builder:** AI conversation completion; estimate→lead rate; trust-driven first-order conversion.
- **Trader:** return frequency; alerts set; price-page sessions.
- **Engineer:** tool usage; assisted-influence (leads citing an estimate).
- **Price-Checker:** «طلا و ارز» → identity-capture rate; return visits.
- **Internal:** % SKUs fresh daily (Operator); lead→won rate & response time (Sales).

---

## 13. Summary
- **Tier 1 (design-for-first):** Contractor + Individual Builder — **co-primary, dual-mode.**
- **Tier 2 (fully supported):** Trader, Industrial, Engineer, Price-Checker.
- **Tier 3:** Supplier (form), Export (future).
- **Internal Tier 1:** Price Operator + Sales Agent.
- **Golden rule:** keep the **two parallel paths** (guided AI vs fast tables); never sacrifice one Tier-1 persona's path for the other; never trade away trust or price-freshness for anyone.

*Next Layer-2 document: Information Architecture & Sitemap (now grounded in these priorities).*

*Fooladno — اول مشورت، بعد خرید.*
