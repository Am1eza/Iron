# Ahantime — Acceptance Criteria (Master Specification)
## Layer 2 · Product Design — Document 6 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `user-stories.md` (summary AC) — this document is the **exhaustive, testable contract**: happy paths, alternate paths, **edge cases, error states, validation rules, business-rule constants, and measurable thresholds**. If a behavior isn't covered here, it is "undefined" and must be specified before build.

### How to read
- **Gherkin scenarios:** `Given / When / Then / And`.
- **VR** = Validation Rule · **BR** = Business Rule · **EC** = Edge Case / Error · **DoD** = Definition of Done.
- **Constants** are named (e.g., `VAT_RATE`) and listed in §1.4; values are configurable in admin unless stated otherwise.
- Priority: all **MVP** unless tagged `[v1.1]`.

---

## 1. Global / Cross-Cutting Acceptance Criteria
These apply to **every** feature and are part of every DoD.

### 1.1 Localization & formatting
- **VR-G1.1** All UI is **RTL**; text is Persian; mirroring (icons, chevrons, progress) is correct.
- **VR-G1.2** Dates are **Jalali** (e.g., ۱۴۰۵/۰۴/۰۵); relative times in Persian («۲ ساعت پیش»).
- **VR-G1.3** Currency is **Toman** with thousands separators and the unit «تومان»; in tables, digits are **tabular** and **right-column-aligned**.
- **VR-G1.4** Numerals render as **Persian digits (۰۱۲۳…)** in UI; inputs accept Persian, Arabic, and Latin digits and normalize them.
- **EC-G1.5** Zero/negative/empty numeric values never render as blank — show «—» or «ناموجود».

### 1.2 Responsive & performance (measurable budgets)
- **BR-G2.1** Mobile-first; verified at 360px width and up.
- **BR-G2.2** Core pages are **server-rendered**. Targets on a typical 4G mobile: **LCP < 2.5s**, **TTFB < 0.8s** (SSR), **CLS < 0.1**.
- **BR-G2.3** AI **first token < 2.0s** after submit; ticker refresh interval = `TICKER_REFRESH` (default 60s).
- **EC-G2.4** No core content is hidden behind a blocking full-page spinner; skeletons/streaming used instead.

### 1.3 Accessibility (WCAG AA)
- **VR-G3.1** Text contrast ≥ **4.5:1** (≥ 3:1 for large/bold), per the brand palette.
- **VR-G3.2** All interactive elements are keyboard-reachable with a visible focus ring (Cobalt).
- **VR-G3.3** Images have alt text; form fields have labels; tables have proper headers/scope for screen readers.

### 1.4 Business-rule constants (defaults; admin-configurable unless noted)
| Constant | Default | Note |
|---|---|---|
| `VAT_RATE` | 10% | Shown/hidden via toggle |
| `QUOTE_VALIDITY` | تا روز کاری بعد، ساعت ۱۱:۰۰ | پیش‌فاکتور countdown |
| `PRICE_FRESH_WINDOW` | همان روز جلالی | defines "fresh" |
| `PRICE_STALE_HIDE_AFTER` | ۲ روز کاری | beyond this, hide price → «تماس بگیرید» |
| `OTP_LENGTH` | 5 digits | numeric |
| `OTP_TTL` | 120s | expiry |
| `OTP_RESEND_COOLDOWN` | 60s | between resends |
| `OTP_MAX_RESEND` | 3 / hour / number | |
| `OTP_MAX_ATTEMPTS` | 5 / code | then lock 15 min |
| `TICKER_REFRESH` | 60s | tgju poll/display |
| `HISTORY_RETENTION` | بدون محدودیت | keep full price history |

### 1.5 Error, empty & offline states (global pattern)
- **EC-G5.1** Every data view defines: **loading**, **empty**, **error/retry**, and **partial/stale** states.
- **EC-G5.2** Network/API failures show a Persian, non-technical message + retry; never a stack trace or English error.
- **EC-G5.3** Third-party outage (tgju/DeepSeek/SMS) degrades gracefully per the feature's EC rules below — never a blank page.

### 1.6 Security & privacy (global)
- **BR-G6.1** Auth = mobile + OTP only (§7). Sessions expire after `SESSION_TTL` (default 30 days, refreshable); logout invalidates.
- **BR-G6.2** Admin routes require role-based authorization; unauthorized access → 403, logged.
- **BR-G6.3** All price/content/lead/role changes are written to the **audit log** (actor, action, before→after, timestamp).
- **VR-G6.4** Phone numbers and lead data are access-controlled; not exposed in client code, logs, or URLs.
- **BR-G6.5** OTP and form endpoints are **rate-limited** per number + IP; abusive patterns are throttled/blocked.

### 1.7 SEO (global)
- **VR-G7.1** Every indexable page is SSR with a unique `<title>` + meta description, canonical URL, OG tags, `lang="fa" dir="rtl"`.
- **VR-G7.2** Schema.org: **Product/Offer** on SKU pages, **Article** on blog/news, **BreadcrumbList** on catalog, **Organization** sitewide.
- **VR-G7.3** XML sitemap + robots.txt are present and include all public price/content pages; clean, human-readable Persian-slug or transliterated URLs.

---

## 2. Ticker «نبض بازار» (Epic A)

**AC-A-1 — Display (happy path)**
```
Given the homepage loads
When the ticker renders
Then it shows USD, EUR, gold-Iran, global-ounce (from tgju) and billet (admin)
And each item shows value (Toman/relevant unit), a direction arrow, and Gain/Loss color
And each item exposes a last-updated time on hover/tap
```
- **BR-A1** Direction/arrow/color derive from each value vs its previous stored value (Gain `#15A34A` up, Loss `#E0322B` down, neutral grey if unchanged).
- **BR-A2** The ticker auto-refreshes every `TICKER_REFRESH`; updates animate smoothly without layout shift.

**AC-A-2 — tgju outage (edge)**
```
Given tgju is unreachable or returns invalid data
When the ticker refreshes
Then the last-known good values remain displayed
And a subtle "به‌روزرسانی با تأخیر" / stale indicator appears
And no value shows blank, zero, or NaN
```

**AC-A-3 — Admin billet entry**
```
Given OP sets the billet value
When OP saves
Then the public ticker reflects it within one refresh cycle
And the change is timestamped and audit-logged
```
- **VR-A3** Billet value must be a positive number; non-numeric/empty is rejected with a Persian inline error.

**AC-A-4 — «طلا و ارز» page** — shows the expanded tgju board + steel references; cross-links to «قیمت آهن امروز»; same outage rules as AC-A-2.

**DoD-A:** all four scenarios pass; global §1 satisfied; verified on mobile.

---

## 3. Catalog & Price Tables (Epic B)

**AC-B-1 — Category rail (happy + responsive)**
```
Given any page
Then the right-side rail lists the 7 categories
When the user hovers a category name (desktop)
Then the name flips to its image
When the user clicks/taps a category
Then its price table opens
And on mobile the rail is available via an equivalent control with the same destinations
```
- **EC-B1** If a category image is missing, a branded placeholder is shown (never a broken image).

**AC-B-2 — Price table content**
```
Given a category table
Then each SKU row shows استاندارد، وزن، قیمت، نوسان، تاریخ، زمان تحویل, and actions
And قیمت is Toman/tabular; نوسان shows sign + % + arrow + color; تاریخ is Jalali
And the table shows a visible last-updated stamp
```
- **BR-B2.1 (نوسان):** `نوسان% = (price_today − price_prev) / price_prev × 100`, rounded to 2 decimals, with sign/arrow/color. If no previous price → «—».
- **BR-B2.2 (freshness):** a SKU fresh within `PRICE_FRESH_WINDOW` shows normally; if older, the **date is still shown**; if older than `PRICE_STALE_HIDE_AFTER`, the price is replaced by «تماس بگیرید» (request CTA) — never a misleading stale number.
- **EC-B2.3:** SKU with no price ever set → «تماس بگیرید» + request CTA, never blank.

**AC-B-3 — Filters/search** — narrowing by size/grade/factory updates rows in < 300ms client-side; empty result shows a Persian empty state with a "ثبت درخواست/پرسش از آهن‌تایم" CTA.

**AC-B-4 — Favorites**
```
Given a logged-in user on a table
When they toggle a row's favorite
Then it is saved and reflected in the account favorites
Given a guest toggles favorite
Then they are prompted to log in (OTP) and the action completes after auth
```

**AC-B-5 — Per-row chart**
```
When the user opens a SKU chart
Then a history chart renders with ranges روز/هفته/ماه/سال
And the default range shows available history; if < 2 points exist, a "تاریخچهٔ کافی موجود نیست" state shows instead of a broken chart
```

**AC-B-6 — Exports**
- **AC-B-6a Excel:** produces a valid `.xlsx` of the current (filtered) table with headers, Jalali date, and a Ahantime header row.
- **AC-B-6b Image-with-logo:** produces a PNG/JP* of the table with logo + header + date, sized for sharing; renders Persian correctly.
- **AC-B-6c Print:** opens a clean, branded print layout (no nav/ads), one table per page-flow.
- **EC-B-6:** export of an empty table is disabled with a tooltip.

**AC-B-7 — VAT & unit toggles**
```
When the VAT toggle is on
Then displayed قیمت includes VAT_RATE and is labeled «با احتساب ۱۰٪ ارزش افزوده»
When off
Then قیمت excludes VAT and is labeled «بدون ارزش افزوده»
When the unit toggle switches کیلویی↔شاخه/برگ
Then prices recompute correctly using the SKU's theoretical weight
```
- **VR-B7:** unit conversion only offered where a valid theoretical weight exists.

**AC-B-8 — Inquiry cart**
```
Given items added to سبد استعلام
Then the cart persists for the session (and to the account if logged in)
When the user submits the cart
Then a single پیش‌فاکتور/lead is created containing all items (Epic F)
And removing the last item empties the cart to its empty state
```

**DoD-B:** B1–B8 pass incl. EC; §1 satisfied; tables verified RTL/tabular/Toman on mobile.

---

## 4. Price Intelligence & Alerts (Epic C)

**AC-C-1 — Create alert**
```
Given a SKU/ticker item
When a user sets an alert (operator: زیر/بالای + value)
And the user is identified (logged-in or phone+OTP)
Then the alert is saved and listed in the account
```
- **VR-C1:** target value must be numeric > 0; condition must be selected; duplicate identical alerts are merged.

**AC-C-2 — Trigger & notify**
```
Given a saved alert and a new price/value that meets the condition
Then exactly one notification is sent via the user's channel (SMS/Telegram)
And the alert is marked triggered (not re-fired until reset/condition re-crosses)
```
- **EC-C2:** notification-channel failure retries per channel policy; persistent failure surfaces in the account as «ارسال ناموفق».

**AC-C-3 — Auto نوسان & history**
```
Given OP saves a new price
Then نوسان is recomputed (BR-B2.1) and a history point {price, timestamp} is appended
And history is retained per HISTORY_RETENTION
```

**AC-C-4 «قیمت ما vs قیمت پایه»** `[v1.1]` — where reference data exists, show both with the delta; if reference is missing, show only our price (no empty comparison).

---

## 5. AI Advisor «آهن‌تایم» (Epic D) — rigorous (critical)

> The AI is the highest-risk surface. These criteria are **mandatory and non-negotiable**.

**AC-D-1 — Presence & clarity**
```
Given the homepage
Then a central AI hero shows a Persian greeting and is clearly labeled an AI assistant
And suggested-question chips are visible
```

**AC-D-2 — Intent-first (BR, mandatory)**
```
Given a user sends a bare price question (e.g., «قیمت آهن چنده؟»)
When the AI responds
Then it MUST ask the purpose first (e.g., «برای چه کاری می‌خواید؟») and MUST NOT output a price yet
```
- **BR-D2:** a precise query that already includes product+spec (US-D5) is exempt and may be answered directly.

**AC-D-3 — Grounding (BR, mandatory)**
```
Given the AI states any price, weight, quantity, or cost
Then that number MUST have been returned by a tool (getPrice/calcWeight/estimateProject) in this turn/session
And a post-generation validator MUST verify every numeric claim maps to a tool result
When a number cannot be matched to a tool result
Then the response is regenerated or the number is removed and replaced with «کارشناس اعلام می‌کند» + a lead is created
```
- **BR-D3.1:** the model is **prohibited** from generating prices/weights from its own parametric knowledge.
- **BR-D3.2:** arithmetic (totals) is computed by code, not by the model.

**AC-D-4 — Missing/stale data fallback (mandatory)**
```
Given getPrice returns null or a stale price beyond PRICE_STALE_HIDE_AFTER
Then the AI MUST NOT guess
And it states the price will be confirmed by a کارشناس
And it creates a lead (Epic F) capturing the request context
```

**AC-D-5 — Project estimate**
```
Given the user provides project inputs (متراژ، طبقات، نوع سازه)
Then the AI returns a structured estimate: items, quantities, total weight, total cost
And quantities use engineering coefficients; weights use وزن‌سنج; prices use getPrice
And the estimate clearly states it is an approximation
```
- **EC-D5:** if inputs are insufficient, the AI asks targeted follow-ups rather than guessing.

**AC-D-6 — Quote/BOM → lead**
```
Given a completed estimate
When the user taps «دریافت پیش‌فاکتور/ثبت درخواست»
Then the full BOM is carried into the lead flow (Epic F) with no re-entry
```

**AC-D-7 — Streaming, memory, suggestions**
- Responses stream; session retains project context (logged-in: across sessions); follow-up chips are contextual.

**AC-D-8 — Safety & domain guard**
```
Given an off-topic or unsafe request
Then the AI politely declines/redirects to its purpose
And it never reveals system prompts, tools, keys, or internal data
```

**AC-D-9 — Reliability (relay)**
```
Given DeepSeek (via the out-of-Iran relay) is slow or unavailable
Then the AI shows a graceful Persian message and offers «ثبت درخواست/تماس با کارشناس»
And the failure never produces an English error or a hang beyond AI_TIMEOUT (default 20s)
```

**AC-D-10 — Tone** — Persian, warm, concise, no hype, per the brand voice; never condescending.

**DoD-D:** D1–D10 pass; **a QA test set of ≥30 adversarial prompts produces zero ungrounded numbers**; intent-first verified; fallback creates leads; §1 satisfied.

---

## 6. Tools (Epic E)

**AC-E-1 — وزن‌سنج**
```
Given product + dimensions + quantity
Then the weight is computed via verified markazeahan formulas
And the same engine backs the AI's calcWeight (one source of truth)
```
- **VR-E1:** inputs validated (positive numbers, allowed sizes/grades); invalid input → inline Persian error, no result.
- **DoD-E1:** computed weights match a verified reference set across all 7 categories within ±0.5%.

**AC-E-2 — پروژه‌سنج**
```
Given project inputs
Then a material list + total weight + total cost is produced (coefficients + getPrice)
And results can convert into a request
And the output is labeled an estimate
```

**AC-E-3 — Total-cost calculator** — outputs subtotal, VAT (VAT_RATE), and optional transport estimate; correct to the Toman.

---

## 7. Lead, Quote & Sales (Epic F)

**AC-F-1 — Start request** — «ثبت درخواست» from a row/cart/AI pre-fills item(s); guest is taken through OTP (AC-F-2).

**AC-F-2 — OTP verification**
```
Given a phone is entered
Then an OTP_LENGTH-digit code is sent (Kavenegar), valid for OTP_TTL
When the correct code is entered within OTP_TTL and OTP_MAX_ATTEMPTS
Then the request proceeds
```
- **VR-F2.1:** phone must be a valid Iranian mobile; normalized to `09XXXXXXXXX` (accept +98/0098/Persian digits).
- **EC-F2.2:** wrong code → attempts decrement; after `OTP_MAX_ATTEMPTS` → 15-min lock + Persian message.
- **EC-F2.3:** resend disabled for `OTP_RESEND_COOLDOWN`; capped at `OTP_MAX_RESEND`.
- **EC-F2.4:** SMS gateway failure → Persian error + retry; the request is not lost (kept as draft).

**AC-F-3 — پیش‌فاکتور generation & delivery**
```
Given a verified request
Then a پیش‌فاکتور PDF is generated with logo/header, item lines, weights, VAT (VAT_RATE), totals, Jalali date, and a unique reference number
And it is delivered via SMS link and/or WhatsApp
And the same پیش‌فاکتور is visible in the user's account
```
- **VR-F3:** all amounts in Toman/Persian tabular digits; totals = Σ lines + VAT, computed server-side.

**AC-F-4 — Quote validity** — the پیش‌فاکتور shows a validity window (`QUOTE_VALIDITY`) and a countdown; on expiry it is marked «منقضی» and offers a refresh.

**AC-F-5 — CRM lead**
```
Given a submitted request
Then a CRM lead is created with: items/BOM, weights, totals, the AI conversation (if any), source page, contact, channel prefs, timestamp
And status = «جدید»
```

**AC-F-6 — Callback / channel handoff** — user can pick «الان» or a time, and/or «ادامه در واتساپ/تلگرام» carrying context; choices are recorded on the lead.

**AC-F-7 — Status visibility** — requester sees «ثبت شد/در حال پیگیری/تماس گرفته شد» + ETA copy. `[full tracking v1.1]`

**DoD-F:** end-to-end request → OTP → پیش‌فاکتور PDF → SMS → CRM lead verified; all VR/EC pass; no online payment present.

---

## 8. Accounts & OTP (Epic G)

**AC-G-1 — Login/Register (mobile+OTP)** — per AC-F-2 rules; first-time success creates an account; returning success authenticates; session per BR-G6.1.
**AC-G-2 — Favorites & history** — both lists are accurate, paginated, and reflect real data; empty states present.
**AC-G-3 — Manage alerts/profile** — user can view/edit/delete alerts and edit profile basics; deletions confirmed.

---

## 9. Customer Club (Epic H)

**AC-H-1 — Intent-timed popup**
```
Given a user completes a quote or sets an alert (and isn't a member, hasn't dismissed recently)
Then the club invite popup may appear once
When dismissed
Then it does not reappear for DISMISS_COOLDOWN (default 7 days)
And it never appears on first page load
```
**AC-H-2 — Join & benefits** — joining enrolls the user; account shows tier (آهن/فولاد/پولاد) + concrete benefits; tier rules are admin-defined.
**AC-H-3 — Admin club management** — ADM can configure tiers/benefits and view/manage members (audit-logged).

---

## 10. Content, News & SEO (Epic I)

**AC-I-1 — Public reading** — news/blog list with Jalali dates; each article SSR + indexable (VR-G7).
**AC-I-2 — AI draft → approval (mandatory gate)**
```
Given the AI generates a news/blog draft (grounded in admin price data + market feed)
Then it enters the approval queue with status «پیش‌نویس»
And it is NOT publicly visible until a CE approves
When CE edits/approves/schedules
Then it publishes at the chosen time; reject removes it
```
- **EC-I2:** drafts containing unverifiable price claims are flagged for the editor.
**AC-I-3 — SEO compliance** — VR-G7.1–G7.3 verified on price, category, and article pages; sitemap auto-includes new content.

---

## 11. Trust & Credibility (Epic J)
**AC-J-1** «چرا آهن‌تایم؟», mill logos «تأمین‌کنندگان», customer logos «مشتریان» render; missing logo → branded placeholder.
**AC-J-2** eNamad/Samandehi/اتحادیه placeholders + exact contact block present:
تهران، اقدسیه، خ موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، ط۴، واحد۷ · ۰۲۱۲۶۲۹۷۵۱۲ · ۰۹۱۲۱۳۹۵۹۵۴; click-to-call works on mobile; map optional.

---

## 12. Communication & Channels (Epic K)
**AC-K-1 — SMS templates** — OTP, پیش‌فاکتور, and alerts use consistent branded Persian templates; sender ID configured; delivery failures logged.
**AC-K-2 — Channel handoff** — WhatsApp/Telegram/Eitaa deep-links open with context; footer lists official channels.

---

## 13. Cooperation / B2B (Epic L)
**AC-L-1** — تأمین از شما / فروش از ما / تحلیل بازار each present an intro + lead form; submissions create CRM leads **tagged by type**; required fields validated; success/empty/error states present.

---

## 14. Admin Panel (Epic M)

**AC-M-1 — Daily price grid (OP) — the spine**
```
Given OP opens the daily price grid
Then all active SKUs appear with last price + last-update time
When OP enters new قیمت + زمان تحویل (single or bulk) and saves
Then the public table updates, نوسان recomputes (BR-B2.1), and a history point is appended
And SKUs not updated today are visibly flagged (stale)
```
- **VR-M1.1:** price must be numeric > 0; زمان تحویل from an allowed set/freeform per config; invalid rows are blocked with inline errors and do not save.
- **BR-M1.2:** the grid is usable on mobile (post-استعلام entry); speed helpers (copy-yesterday, ±% nudge, Excel paste/import) work and respect validation.
- **EC-M1.3:** bulk import with some invalid rows imports valid rows and reports the failures; nothing is silently dropped.
- **BR-M1.4:** every change is audit-logged (actor, SKU, old→new, time).

**AC-M-2 — Stale guard** — a public SKU stale beyond `PRICE_STALE_HIDE_AFTER` hides its price (→ «تماس بگیرید»); OP sees a prominent stale list to act on.

**AC-M-3 — Catalog (CM)** — create/edit/disable categories→sub→SKUs with specs + images; disabling a SKU removes it from public tables but retains its history.

**AC-M-4 — CRM (SA)** — leads list with full context; assign, change status (جدید/در تماس/برنده/بازنده), add notes, schedule callback; all changes logged.

**AC-M-5 — Content (CE)** — approval queue per AC-I-2; edit/approve/schedule/reject; nothing auto-publishes.

**AC-M-6 — Users/roles/audit (ADM)** — assign granular roles; 403 on unauthorized; audit log is searchable by actor/entity/date.

**AC-M-7 — Ticker/logos/banners/club (ADM)** — manage billet/ticker values, mill/customer logos, banners/popups, and club tiers; changes reflect publicly within one refresh and are logged.

**AC-M-8 — Analytics** — dashboard shows price-freshness %, leads (new/won), traffic, funnel events; numbers reconcile with source data.

**DoD-M:** OP can publish a full day's prices in one session with stale-flagging and history; CRM/content/role flows pass; all admin actions audit-logged.

---

## 15. Cross-Cutting (Epic N)
**AC-N-1** — RTL/Jalali/Toman/Persian-digit + AA contrast + mobile performance verified across all public views (§1.1–1.3, 1.7).
**AC-N-2** — AI reliability: relay + fallback verified (AC-D-9); no English errors; graceful degradation everywhere (§1.5).
**AC-N-3** — Security: OTP rules, rate-limits, RBAC, audit logging, and phone/lead data protection verified (§1.6).

---

## 16. Master Definition of Done (release gate)
A feature/release is **Done** only when:
- [ ] All in-scope scenarios (happy + alternate + EC) pass.
- [ ] All **VR/BR** enforced server-side (not just client).
- [ ] Global §1 criteria met (localization, performance budgets, accessibility, security, SEO, error/empty states).
- [ ] **AI: zero ungrounded numbers** across the adversarial test set; intent-first + fallback verified.
- [ ] **Prices: never show a stale number without its date; never blank.**
- [ ] **Lead flow: request → OTP → پیش‌فاکتور → SMS → CRM with full context** works end-to-end.
- [ ] Admin: daily prices publishable fast with stale-flagging + history + audit log.
- [ ] Brand applied per brand book; verified on mobile + desktop.
- [ ] No online payment present (scope guard).

*Next Layer-2 document: Information Architecture & Sitemap.*

*Ahantime — اول مشورت، بعد خرید.*
