# Ahantime — User Stories
## Layer 2 · Product Design — Document 5 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `product-scope.md`, `mvp.md`, `feature-list.md`, `user-prioritization.md`
**Purpose:** Translate personas + features into precise, testable requirements from the user's point of view. These stories drive design, build, and QA.

### Conventions
- **Format:** *As a [persona], I want [capability], so that [benefit].*
- **Acceptance Criteria (AC):** Given / When / Then, testable and unambiguous.
- **Personas:** P1 Contractor (پیمانکار) · P2 Builder (سازندهٔ شخصی) · P3 Trader (بنگاه‌دار) · P4 Industrial (خریدار صنعتی) · P5 Engineer (مهندس/معمار) · P6 Price-Checker (کنجکاو) · P7 Supplier (تأمین‌کننده) · Internal: **OP** Price Operator · **SA** Sales Agent · **CE** Content Editor · **CM** Catalog Manager · **ADM** Super Admin.
- **Priority:** all are **MVP** unless tagged `[v1.1]`/`[v2]`.

### Global acceptance criteria (apply to every public story)
- **G1 — Localization:** UI is full RTL, Persian text, **Jalali dates**, **Toman**, Persian digits; tables use tabular numerals.
- **G2 — Responsive:** every story works on mobile (primary) and desktop.
- **G3 — Performance:** primary content is server-rendered/fast; no blocking spinners on core views.
- **G4 — Accessibility:** AA contrast per the brand book; keyboard/screen-reader basics.
- **G5 — Trust visible:** brand, real contact, and freshness/last-updated are never more than one screen away.

---

## EPIC A — Market Data & Ticker «نبض بازار»

**US-A1** — *As P6 (Price-Checker), I want a live ticker of dollar, euro, gold (Iran), global ounce, and steel billet at the top of the page, so that I get what I came for instantly.*
- AC1: Given the homepage loads, the ticker shows USD, EUR, gold-Iran, global-ounce (from tgju) and billet (admin) with current values.
- AC2: Each item shows an up/down arrow + color derived from its recent change.
- AC3: Values auto-refresh without a full page reload; each shows a last-updated time on hover/tap.
- AC4: If tgju is unreachable, last-known values display with a subtle "stale" indicator (no broken/empty ticker).

**US-A2** — *As P3 (Trader), I want a dedicated «طلا و ارز» page, so that I can scan the full currency/gold board in one place.*
- AC1: A linked page shows the expanded FX/gold/coin board (tgju) plus steel billet/raw-material references.
- AC2: The page cross-links to steel categories ("قیمت آهن امروز") to pull checkers into the catalog.

**US-A3** — *As OP, I want to enter and update the billet and any admin-managed market values, so that the ticker reflects reality.*
- AC1: Given OP opens ticker management, they can set billet (and other admin values) with a value + timestamp.
- AC2: On save, the public ticker updates and the change is logged.

---

## EPIC B — Price Catalog & Tables

**US-B1** — *As any visitor, I want a fixed right-side category rail with the 7 main categories, so that I can reach any product fast.*
- AC1: The rail is pinned on the right across the site; lists میلگرد، تیرآهن، پروفیل، ورق گرم، ورق سرد، نبشی و ناودانی، لوله.
- AC2: **On hover, the category name flips to its image**; on click, its price table opens.
- AC3: On mobile, the rail collapses into an accessible equivalent (e.g., bottom/side sheet) preserving the same navigation.

**US-B2** — *As P1 (Contractor), I want a price table with استاندارد، وزن، قیمت، نوسان، تاریخ، and **زمان تحویل**, so that I can decide and buy quickly.*
- AC1: Each SKU row shows all six columns plus actions; numbers are Toman, tabular, Persian digits.
- AC2: نوسان shows direction (up/down color + arrow) and % vs previous.
- AC3: The table shows a visible **last-updated** timestamp; stale data is never shown without its date.

**US-B3** — *As P3 (Trader), I want sub-categories and quick filter/search, so that I find a specific size/grade/factory instantly.*
- AC1: Each main category expands to sub-categories (type/standard, size, grade, factory).
- AC2: A filter/search narrows rows by size, grade, and producing factory in real time.

**US-B4** — *As P1, I want to add a SKU to favorites, so that I can track it later.*
- AC1: A favorite control on each row toggles state; favorited items appear in the user's favorites list (requires login — see Epic G).

**US-B5** — *As P3, I want a price chart per SKU over selectable ranges, so that I can see the trend.*
- AC1: A chart action opens a history chart with ranges (روز/هفته/ماه/سال).
- AC2: The chart reflects the stored price history; empty/short history is handled gracefully.

**US-B6** — *As P1, I want to export a table to Excel, get a table image with the company logo/header, or print it, so that I can share or file it.*
- AC1: "دانلود اکسل" produces an .xlsx of the current table.
- AC2: "تصویر با لوگو" produces a branded image of the table (header + logo) suitable for WhatsApp.
- AC3: "پرینت" opens a clean print layout.

**US-B7** — *As P2 (Builder), I want a VAT toggle and a per-kg/per-piece toggle, so that I understand the real price.*
- AC1: A toggle switches قیمت between با/بدون ۱۰٪ ارزش افزوده.
- AC2: A toggle switches between کیلویی and شاخه/برگ where applicable.

**US-B8** — *As P1, I want to add several SKUs to an inquiry cart, so that I can request one consolidated پیش‌فاکتور.*
- AC1: Rows can be added to a سبد استعلام; the cart persists during the session (and to the account if logged in).
- AC2: From the cart, the user can submit one request producing a single پیش‌فاکتور (see Epic F).

**US-B9** — *As P3, I want to compare selected SKUs side by side, so that I can choose the best option.* `[v1.1]`
- AC1: Selecting 2–4 rows opens a comparison view of spec/قیمت/نوسان/تحویل.

---

## EPIC C — Price Intelligence (history, alerts, transparency)

**US-C1** — *As P3 (Trader), I want to set a price alert on a SKU or ticker value, so that I'm notified when it hits my target.*
- AC1: From a row/ticker item, the user sets a rule (e.g., "میلگرد ۱۴ زیر X" or "دلار بالای Y").
- AC2: Setting an alert requires identity (logged-in or phone+OTP).
- AC3: When the condition is met, the user receives a notification via their chosen channel (SMS/Telegram).

**US-C2** — *As P3, I want a daily market digest, so that I stay current without visiting.* `[v1.1]`
- AC1: Opt-in users receive a once-daily price + FX summary via SMS/Telegram.

**US-C3** — *As P2 (Builder), I want to see our price next to the bourse base price «قیمت ما vs قیمت پایه», so that I trust I'm not overpaying.* `[v1.1]`
- AC1: Where reference data exists, the table/SKU page shows our price beside the bourse base with the difference.

**US-C4** — *As OP, I want نوسان and price history to be generated automatically when I enter a price, so that I don't maintain them by hand.*
- AC1: Given OP saves a new price, the system computes نوسان vs the previous value and appends a history point with timestamp.

---

## EPIC D — AI Advisor «آهن‌تایم» (critical)

**US-D1** — *As any visitor, I want a central AI search bar that greets me and is clearly an AI, so that I know I can ask for help.*
- AC1: The homepage shows a central rectangle/search hero with a greeting (e.g., «سلام، من آهن‌تایمم. چه محصولی می‌خواید بخرید؟»).
- AC2: It is visibly labeled as an AI assistant; suggested-question chips are shown.

**US-D2** — *As P2 (Builder), when I ask a bare price, I want the AI to ask my purpose first, so that it can truly help me.*
- AC1: Given a user types "قیمت آهن/میلگرد چنده؟", the AI does **not** dump a number; it asks the purpose («برای چه کاری می‌خواید؟»).
- AC2: Based on the answer (e.g., "ساخت ساختمان"), it continues a guided dialog (متراژ، طبقات، نوع سازه…).

**US-D3** — *As P2, I want the AI to estimate my project's material list, total weight, and total cost, so that I can plan and buy confidently.*
- AC1: The AI gathers inputs and returns a structured estimate: items (میلگرد/تیرآهن/…), quantities, total weight, and total cost.
- AC2: Quantities use engineering coefficients; weights use وزن‌سنج; prices use getPrice — all server-computed.

**US-D4** — *As any user, I want the AI to never invent a price or weight, so that I can trust it.*
- AC1: Every numeric value the AI states is sourced from a tool (getPrice/calcWeight/estimateProject) and validated before display.
- AC2: Given required price data is missing/stale, the AI does **not** guess; it says a کارشناس will follow up and **creates a lead** (Epic F).

**US-D5** — *As P1 (Contractor), I want fast AI lookups too, so that I don't have to chat long when I already know what I want.*
- AC1: Given a precise query ("قیمت میلگرد ۱۴ A3 ذوب آهن"), the AI returns the grounded price + زمان تحویل immediately and offers «ثبت درخواست».

**US-D6** — *As any user, I want suggested follow-up questions, so that I discover useful next steps.*
- AC1: After an answer, the AI shows context chips (e.g., «وزن کل رو حساب کنم؟»، «برآورد هزینه پروژه؟»).

**US-D7** — *As any user, I want the AI to turn our conversation into a پیش‌فاکتور/request in one step, so that I can act on it.*
- AC1: A completed estimate offers a one-tap «دریافت پیش‌فاکتور/ثبت درخواست» that carries the full BOM into the lead flow.

**US-D8** — *As any user, I want streaming replies and session memory, so that it feels responsive and remembers my project.*
- AC1: Responses stream token-by-token; within a session the AI retains the project context (logged-in: across sessions).

**US-D9** — *As any user, I want to talk to the AI by voice in Persian, so that I can use it hands-free.* `[v1.1]`
- AC1: A mic control captures Persian speech and submits it as a query.

**US-D10** — *As any user, I want to escalate to a human, so that I can get help the AI can't give.*
- AC1: The AI offers a «گفتگو با کارشناس / تماس» handoff that creates a lead/callback. `[live chat v1.1]`

---

## EPIC E — Tools & Calculators

**US-E1** — *As P5 (Engineer)/P2, I want a weight calculator «وزن‌سنج», so that I can compute weight by product/size/quantity.*
- AC1: Selecting product + dimensions + quantity returns the weight using verified markazeahan formulas.
- AC2: The same engine powers the AI's calcWeight (single source of truth).

**US-E2** — *As P2 (Builder), I want a project estimator «پروژه‌سنج», so that I can estimate materials and cost for my build.*
- AC1: Inputs (متراژ، طبقات، نوع سازه) produce a material list + weight + cost using coefficients + getPrice.
- AC2: The estimator is available both standalone and inside the AI; results can become a request.

**US-E3** — *As P2, I want a total-cost calculator (qty × price + VAT + transport estimate), so that I see the all-in number.*
- AC1: Given items and quantities, the calculator outputs subtotal, VAT, and an optional transport estimate.

---

## EPIC F — Lead, Quote & Sales (traditional close)

**US-F1** — *As P1 (Contractor), I want to submit a request from a table row or the AI, so that I can get a پیش‌فاکتور.*
- AC1: A «ثبت درخواست» control on rows/AI results starts the request flow with the item(s) pre-filled.

**US-F2** — *As a new requester, I want to confirm my phone with OTP, so that my request is verified.*
- AC1: The flow captures name + mobile and sends an OTP (Kavenegar); on correct code, the request proceeds.

**US-F3** — *As P1/P2, I want an automatic پیش‌فاکتور PDF with the company logo/header, so that it feels official.*
- AC1: On submission, a PDF پیش‌فاکتور is generated with logo/header, item lines, weights, VAT, and totals (tabular Persian numerals, Jalali date).
- AC2: The پیش‌فاکتور is delivered via SMS (link) and/or WhatsApp.

**US-F4** — *As P1, I want a quote-validity countdown, so that I know how long the price holds.*
- AC1: The پیش‌فاکتور/quote shows a validity window (e.g., «معتبر تا فردا ساعت ۱۱») with a countdown.

**US-F5** — *As SA (Sales Agent), I want each request to create a CRM lead with full context, so that my callback is informed.*
- AC1: A new lead records: items/BOM, weights, the AI conversation, source page, contact, timestamp.
- AC2: The lead enters the pipeline with status = "جدید" and can be assigned.

**US-F6** — *As P2, I want to choose a callback time and continue on WhatsApp/Telegram, so that I interact how I prefer.*
- AC1: The requester can pick «الان» or a time; and/or tap «ادامه در واتساپ/تلگرام» which carries the cart/quote context.

**US-F7** — *As P1, I want to see my request's status, so that I know what's happening.*
- AC1: The requester sees a status (ثبت شد / در حال پیگیری / تماس گرفته شد) and an ETA message. `[full tracking v1.1]`

**US-F8** — *As P1, I want to reorder a previous request, so that repeat buying is fast.* `[v1.1]`
- AC1: From history, "تکرار سفارش" pre-fills a new request from a past one.

**US-F9** — *As SA, I want to update lead status and add notes, so that the pipeline reflects reality.*
- AC1: SA can move a lead across statuses (جدید/در تماس/برنده/بازنده), assign it, and log notes/outcomes.

---

## EPIC G — Accounts & Personalization

**US-G1** — *As any user, I want to register/log in with my mobile + OTP, so that I can access personal features.*
- AC1: Entering a mobile sends an OTP; a correct code creates/authenticates the account. No password required.

**US-G2** — *As a registered user, I want my favorites and request history, so that I can pick up where I left off.*
- AC1: Favorites and past requests/پیش‌فاکتورها are listed in the account.

**US-G3** — *As a registered user, I want to manage my alerts and profile, so that I control my experience.*
- AC1: The user can view/edit/delete price alerts and basic profile info.

---

## EPIC H — Customer Club «باشگاه آهن‌تایم»

**US-H1** — *As a returning user, I want an invitation to join the club at the right moment, so that it feels helpful not annoying.*
- AC1: A join popup appears **intent-timed** (after a quote/alert), not on first load; it can be dismissed and won't nag.

**US-H2** — *As a user, I want to join the club and see my tier and benefits, so that I know what I get.*
- AC1: Joining enrolls the user; the account shows tier (آهن/فولاد/پولاد) and concrete benefits (locked prices, priority delivery, dedicated advisor, exclusive alerts/content).

**US-H3** — *As ADM, I want to manage club tiers, members, and benefits, so that the program runs.*
- AC1: ADM can configure tiers/benefits and view/manage members.

---

## EPIC I — Content, News & SEO

**US-I1** — *As any visitor, I want news and a blog, so that I stay informed and trust the brand.*
- AC1: News and blog sections list articles with Jalali dates; each article has a clean, indexable URL.

**US-I2** — *As CE, I want the AI to draft market news and a daily blog post for my approval, so that content stays fresh without manual writing.*
- AC1: The AI generates drafts grounded in admin price data + a market feed; drafts appear in an approval queue.
- AC2: **No draft publishes without CE approval;** CE can edit, approve, schedule, or reject.

**US-I3** — *As P6/P2, I want buying guides and a glossary, so that I learn what to buy.* `[v1.1]`
- AC1: Guides and a اصطلاحنامه are available and indexable.

**US-I4** — *As the business, I want strong technical SEO, so that we win organic search.*
- AC1: Price pages, categories, and articles are server-rendered with schema.org, metadata, clean URLs, and are in the sitemap.

---

## EPIC J — Trust & Credibility

**US-J1** — *As P2 (Builder), I want a clear «چرا آهن‌تایم؟», so that I understand why to trust/choose you.*
- AC1: A section states the advantages (transparent prices, guaranteed delivery, AI advisor, speed, value, expert support).

**US-J2** — *As any visitor, I want to see supplier (mill) logos and customer logos, so that I trust the operation.*
- AC1: «تأمین‌کنندگان» shows mill logos (فولاد مبارکه، ذوب آهن…); «مشتریان» shows customer logos.

**US-J3** — *As any visitor, I want trust badges and real contact details, so that I know you're legitimate.*
- AC1: eNamad/Samandehi placeholders, اتحادیه, and the real address + phones are shown:
  تهران، اقدسیه، خیابان موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، طبقه چهارم، واحد ۷ · ۰۲۱۲۶۲۹۷۵۱۲ · ۰۹۱۲۱۳۹۵۹۵۴.
- AC2: A click-to-call works on mobile.

**US-J4** — *As P2, I want reviews/testimonials and a guarantee, so that I feel safe ordering.* `[v1.1]`
- AC1: Testimonials and a written price/quality guarantee are shown.

---

## EPIC K — Communication & Channels

**US-K1** — *As any user, I want to receive OTP, پیش‌فاکتور, and alerts by SMS, so that I get important messages reliably.*
- AC1: SMS (Kavenegar) delivers OTP, پیش‌فاکتور links, and triggered alerts; templates are consistent and branded.

**US-K2** — *As any user, I want to continue or follow on WhatsApp/Telegram/Eitaa, so that I use channels I trust.*
- AC1: Handoff buttons open WhatsApp/Telegram/Eitaa with context; price channels are linked in the footer.

**US-K3** — *As P3, I want a Telegram/Eitaa price-bot, so that I can get prices/alerts in-channel.* `[v1.1]`
- AC1: A bot returns current prices and pushes the user's alerts.

---

## EPIC L — Cooperation / B2B «همکاری با ما»

**US-L1** — *As P7 (Supplier), I want to submit a «تأمین از شما» offer, so that you can source from me.*
- AC1: A form captures supplier/product/quantity/price/contact and creates a CRM lead tagged "تأمین".

**US-L2** — *As P1/P4, I want «فروش از ما» and «تحلیل بازار» entry points, so that I can partner/buy in bulk or get analysis.*
- AC1: Each track has an intro + a lead form; submissions create CRM leads tagged by type.

---

## EPIC M — Admin Panel (internal)

**US-M1 (OP)** — *As a Price Operator, I want a fast daily price grid for all SKUs, so that I can publish today's prices in minutes.*
- AC1: All active SKUs appear in one screen with last price + last-update time; OP enters new قیمت + زمان تحویل and saves (single or bulk).
- AC2: On save, نوسان is auto-computed and a history point appended; the public table updates.
- AC3: SKUs **not updated today are flagged**; the grid is usable on mobile (post-استعلام entry).
- AC4: Speed helpers exist: copy-yesterday, ±% nudge, bulk Excel import/paste.

**US-M2 (OP)** — *As OP, I want stale prices guarded, so that we never mislead buyers.*
- AC1: A public SKU whose price is stale shows its true date; OP sees a clear stale warning to act.

**US-M3 (CM)** — *As a Catalog Manager, I want to manage categories, sub-categories, SKUs, specs, and images, so that the catalog is correct.*
- AC1: CM can create/edit/disable categories→sub→SKUs with specs (standard/size/grade/factory/theoretical weight) and category images.

**US-M4 (SA)** — *As a Sales Agent, I want a CRM pipeline with full lead context, so that I close efficiently.*
- AC1: SA sees leads with items/BOM/AI-convo/source/contact; can assign, change status, log notes, and schedule callbacks.

**US-M5 (CE)** — *As a Content Editor, I want to review/approve/schedule AI-drafted content, so that quality and SEO are protected.*
- AC1: CE sees the draft queue; can edit/approve/schedule/reject; nothing publishes without approval.

**US-M6 (ADM)** — *As Super Admin, I want users, roles, and an audit log, so that access is controlled and traceable.*
- AC1: ADM assigns granular roles (OP/SA/CE/CM/ADM); all price/content/lead changes are logged with user + timestamp.

**US-M7 (ADM)** — *As ADM, I want to manage ticker values, mill/customer logos, banners, and the club, so that I control site content.*
- AC1: ADM can update billet/ticker values, upload/remove logos and banners, and configure club tiers/benefits.

**US-M8 (OP/ADM)** — *As OP, I want a supplier استعلام log, so that I can record which supplier quoted what.* `[v1.1]`
- AC1: OP can attach an استعلام note (supplier, price, time) to a SKU for internal reference.

**US-M9 (ADM)** — *As ADM, I want a basic analytics dashboard, so that I can see health.*
- AC1: A dashboard shows price-freshness %, leads (new/won), traffic, and key funnel events.

---

## EPIC N — Cross-cutting / Non-Functional Stories

**US-N1** — *As any user, I want the site fast and correct in Persian/RTL/Jalali/Toman on my phone, so that it's trustworthy and usable.* (Covers G1–G4.)
- AC1: All public views verified for RTL, Jalali, Toman, Persian digits, AA contrast, mobile performance.

**US-N2** — *As the business, I want the AI to run reliably from Iran, so that it's always available.*
- AC1: AI calls route server-side through the out-of-Iran relay with a fallback path; failures degrade gracefully (AI offers callback instead of erroring).

**US-N3** — *As the business, I want security and privacy, so that user phones/leads are protected.*
- AC1: OTP auth, role-based admin access, audit logging, and careful handling/storage of phone numbers and lead data.

---

## Story Index & Coverage
- **External epics:** A (ticker) · B (catalog/tables) · C (price intelligence) · D (AI) · E (tools) · F (lead/sales) · G (accounts) · H (club) · I (content/SEO) · J (trust) · K (channels) · L (cooperation).
- **Internal epic:** M (admin: OP/SA/CE/CM/ADM).
- **Cross-cutting:** N (localization, AI reliability, security).
- **Persona coverage check:** P1 ✔ (B,F) · P2 ✔ (D,E,F,J) · P3 ✔ (A,B,C,K) · P4 ✔ (B,L) · P5 ✔ (E) · P6 ✔ (A,I) · P7 ✔ (L) · OP/SA/CE/CM/ADM ✔ (M).

*Next Layer-2 document: Information Architecture & Sitemap (these stories map onto pages/routes).*

*Ahantime — اول مشورت، بعد خرید.*
