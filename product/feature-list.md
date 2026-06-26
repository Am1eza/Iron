# Fooladno — Feature List (Big Brainstorm)
## Layer 2 · Product Design — Document 3 of N

**Version:** 1.0 · 26 June 2026
**Status:** Brainstorm for review & prioritization
**Builds on:** `product-scope.md`, `mvp.md`
**Purpose:** A comprehensive catalog of every useful feature — those you've already requested (now **MVP**), plus new ideas, plus the best features observed across Iranian and global competitors (source tagged). We use this to **decide which post-MVP ideas to adopt**.

### Legend
- **★ MVP** — confirmed in the first launch (your described features + essentials).
- **➕ Add** — proposed high-value addition; recommend for MVP or v1.1 (your call).
- **◇ Future** — bigger bet for v2 / Web App / Mobile App.
- *Inspired by* — competitor(s) doing it well; **(ours)** = our own innovation.

---

## 1. Market Data & Ticker — «نبض بازار» (the magnet)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|1.1|Live ticker ribbon|USD, EUR, gold (Iran), global ounce (tgju), steel billet (admin) with up/down color + arrows|★ MVP|tgju.org, BigMint, Mysteel|
|1.2|Dedicated «طلا و ارز» mini-page|Give dollar/gold-checkers exactly what they came for (full FX/gold/coin board from tgju) — then surround with steel to convert them|➕ Add (MVP)|tgju.org *(retention play — ours)*|
|1.3|Steel billet & raw-material board|شمش، آهن اسفنجی، قراضه — admin-entered reference prices|➕ Add|Mysteel, ahaninfo|
|1.4|Bourse offering calendar|عرضه‌های بورس کالا (date, base price, volume, weighted-avg close)|◇ Future|ahaninfo.ir, foolad24|
|1.5|Currency-impact indicator|Show how today's dollar move correlates with steel prices ("هر ۱٪ دلار ≈ ...")|◇ Future|*(ours)*|
|1.6|Daily market digest|Auto SMS/Telegram "price + FX summary" once a day|➕ Add (v1.1)|BigMint, Mysteel|

---

## 2. Price Catalog & Tables (the core data product)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|2.1|7 main categories + sub-categories|میلگرد، تیرآهن، پروفیل، ورق گرم، ورق سرد، نبشی و ناودانی، لوله → full sub-tree|★ MVP|ahanprice.com|
|2.2|Fixed right-side category rail|Names pinned right; **hover → name flips to image**; click → table|★ MVP|*(your design)*|
|2.3|Price table columns|استاندارد · وزن · قیمت · نوسان · تاریخ · **زمان تحویل** · actions|★ MVP|ahanprice + **زمان تحویل (ours)**|
|2.4|Last-updated stamp|Freshness time on every table/row (trust)|★ MVP|OfBusiness (timestamps)|
|2.5|Favorites / watchlist|افزودن به علاقه‌مندی‌ها|★ MVP|*(your req)*|
|2.6|Per-row price chart|Time-range chart (روز/هفته/ماه/سال)|★ MVP|ahanonline, fooladsell|
|2.7|Excel export of table|دانلود اکسل|★ MVP|*(your req)*|
|2.8|Table image with logo/header|دریافت تصویر جدول با سربرگ و لوگو (great for WhatsApp sharing)|★ MVP|*(your req)* — B2B sharing|
|2.9|Print view|پرینت جدول|★ MVP|*(your req)*|
|2.10|VAT toggle|قیمت با/بدون ۱۰٪ ارزش افزوده|➕ Add (MVP)|ahanprice (VAT inclusive)|
|2.11|Unit toggle|قیمت کیلویی ↔ شاخه/برگ (per-kg ↔ per-piece)|➕ Add (MVP)|ahanonline|
|2.12|Factory vs بنگاه price levels|Show کارخانه and بازار/بنگاه side by side|➕ Add|ahanonline|
|2.13|Stock / availability badge|موجود / تماس بگیرید / به‌زودی|➕ Add|ParkerSteel (live stock)|
|2.14|Quick filter & search|Filter by size/grade/factory; instant search|➕ Add (MVP)|OnlineMetals material selector|
|2.15|Compare SKUs|Select rows → side-by-side compare|➕ Add|samaneahan|
|2.16|Inquiry cart (multi-item)|افزودن به سبد استعلام → consolidated پیش‌فاکتور|➕ Add (MVP)|Bryzos BOM, JSW cart|
|2.17|Mill certificate availability|گواهی آنالیز / استاندارد per SKU|◇ Future|OnlineMetals, Reliance (mill certs)|
|2.18|Standard reference tables|جدول اشتال / وزن استاندارد / گرید‌ها|➕ Add|Steel Express (charts)|

---

## 3. Price Intelligence (turn data into a reason to return)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|3.1|Price history / archive|Full per-SKU history powering charts|★ MVP|ahanonline, ahangar|
|3.2|نوسان indicators|Daily/weekly/monthly % change + arrows|★ MVP|BigMint, OfBusiness|
|3.3|Price alerts — «قیمت‌سنج»|"Notify me when X drops below Y / dollar hits Z" → SMS/Telegram|★ MVP (you want all)|BigMint push alerts|
|3.4|«قیمت ما vs قیمت پایه»|Transparency: our price next to bourse base — radical trust|➕ Add|ahaninfo + **(ours)**|
|3.5|"Lowest in N days" badge|Highlight genuine dips|➕ Add|*(ours)*|
|3.6|Best-time-to-buy hint|AI trend signal "احتمال افزایش/کاهش" (clearly labeled estimate)|◇ Future|Mysteel/MEPS forecasts|
|3.7|Multi-factory price compare|Same spec across producers|➕ Add|samaneahan|
|3.8|Fooladno Price Index|A branded reference index («شاخص فولادنو») — long-term authority play|◇ Future|Mysteel, BigMint, Bryzos Index|

---

## 4. AI Advisor — «فولادنو» (the differentiator)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|4.1|Central AI search hero|Top-center rectangle; greeting; **clearly an AI**; suggested-question chips|★ MVP|*(your design)*; Zhaogang AI|
|4.2|Intent-first consulting|Asks purpose before quoting («برای چه کاری؟»)|★ MVP|*(your req — ours)*|
|4.3|Grounded answers (tools)|getPrice / calcWeight / estimateProject / createLead — never invents numbers|★ MVP|thyssenkrupp "alfred"|
|4.4|Project cost + weight estimate|Full estimate for a build from a conversation|★ MVP|Tata Aashiyana estimators|
|4.5|Quote/BOM builder|Conversation → structured پیش‌فاکتور/BOM → lead|★ MVP|Bryzos BOM upload|
|4.6|Suggested questions|Proactive next-step chips ("وزن کل؟ هزینه پروژه؟")|★ MVP|*(your req)*|
|4.7|Streaming + session memory|Feels alive; remembers the project|★ MVP|modern chat UX|
|4.8|Number-validation guardrail|Every stated number must match a tool result|★ MVP|*(ours — accuracy)*|
|4.9|Persian voice input|Speak your request (hands-free on site)|➕ Add|Moglix voice search|
|4.10|BOM / list upload|Upload Excel/list/نقشه → AI parses → quote|➕ Add|Bryzos|
|4.11|Money-saving advisor|Suggests cheaper grade/size/factory alternatives|➕ Add|*(ours — true advisor)*|
|4.12|AI on Telegram/Eitaa/WhatsApp|Same advisor as a bot where users already are|◇ Future|Tata WhatsApp bot|
|4.13|Photo/drawing recognition|Photo of a نقشه or product → identify/estimate (vision)|◇ Future|*(ours)*|
|4.14|Proactive follow-up|AI re-engages via SMS when a saved project's price drops|◇ Future|*(ours)*|
|4.15|Knowledge base / RAG|Standards, اصطلاحات, how-to grounding|★ MVP|*(ours)*|

---

## 5. Tools & Calculators (free magnets + SEO)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|5.1|Weight calculator — «وزن‌سنج»|Weight by product/size/qty (markazeahan formulas)|★ MVP|markazeahan.com|
|5.2|Project estimator — «پروژه‌سنج»|متراژ/طبقات/نوع سازه → material list + weight + cost|★ MVP (standalone + in AI)|Tata Aashiyana|
|5.3|Count↔weight↔length converter|محاسبه تعداد شاخه/برگ ↔ وزن|➕ Add|Speedy/Metals Depot|
|5.4|Total-cost calculator|qty × price + VAT + transport estimate|➕ Add (MVP)|Metals4U pricing|
|5.5|Unit/standard converters|اشتال، grade, unit conversions, hardness|➕ Add|Steel Express tools|
|5.6|Installment/credit calculator|If credit offered: اقساط/چک schedule|◇ Future|Tata EMI calculator|
|5.7|Rebar/cut optimizer|Bar-bending & cut-length optimization|◇ Future|construction tools|

---

## 6. Lead, Quote & Sales (traditional close, modern path)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|6.1|«ثبت درخواست» from row/AI|One-tap request → lead|★ MVP|*(your flow)*|
|6.2|پیش‌فاکتور PDF (logo header)|Auto-generated, professional|★ MVP|esfahanahan, fooladsell|
|6.3|Deliver via SMS / WhatsApp|Send the پیش‌فاکتور instantly|★ MVP|*(your flow)*|
|6.4|CRM lead with full context|Items, weights, AI convo, source — warm sales calls|★ MVP|*(ours)*|
|6.5|Callback scheduling|"الان / ساعت X تماس بگیرید"|★ MVP|*(ours)*|
|6.6|«ادامه در واتساپ/تلگرام»|Hand-off carrying cart context|★ MVP|*(ours)*|
|6.7|Quote validity countdown|"قیمت معتبر تا فردا ۱۱" (handles intraday volatility)|➕ Add (MVP)|Bryzos price-lock, Iran 3%-deposit norm|
|6.8|Request/order status tracking|Customer sees lead stages|➕ Add|JSW stage tracking, Moglix|
|6.9|Reorder from history|تکرار سفارش قبلی|➕ Add|Yarde/Reliance reorder|
|6.10|Share/save quote link|Send a quote to a colleague|➕ Add|The Metal Store email-quote|
|6.11|Click-to-call / request-a-call|Instant phone connect|★ MVP|all Iranian sites|
|6.12|Human live-chat fallback|Escalate from AI to a person|➕ Add|ahanonline consultants|
|6.13|Credit options surfaced|چک/LC/اقساط as request options (facilitated, offline)|➕ Add|ahanprice, ahanonline, India NBFCs|

---

## 7. Accounts & Personalization

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|7.1|Mobile + OTP auth|Phone-first login|★ MVP|*(your decision)*|
|7.2|Favorites & saved projects|Watchlist + saved estimates|★ MVP|*(your req)*|
|7.3|Request/quote history|All past پیش‌فاکتورها|★ MVP|JSW dashboard|
|7.4|Personalized dashboard|Your prices, alerts, club status|◇ Future (Web App)|JSW/Moglix dashboards|
|7.5|Saved alert rules|Manage قیمت‌سنج alerts|➕ Add (with 3.3)|BigMint|
|7.6|Personalized recommendations|"محصولات مرتبط با پروژه شما"|◇ Future|Tata AI recos|

---

## 8. Customer Club & Loyalty — «باشگاه فولادنو»

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|8.1|Tiered membership|آهن → فولاد → پولاد with concrete benefits|★ MVP|OnlineMetals Bronze/Copper|
|8.2|Intent-timed join popup|Invite after a quote/alert (not on-load)|★ MVP|*(your req, refined)*|
|8.3|Member benefits|Locked prices, priority delivery, dedicated advisor, exclusive alerts/content|★ MVP|*(your req)*|
|8.4|Points / rewards|Earn on activity/purchases|➕ Add|loyalty norms|
|8.5|Referral program|دعوت دوستان → reward both|➕ Add|growth norm|
|8.6|Member-only content & deals|Exclusive analysis/offers|➕ Add|Mysteel premium tier|

---

## 9. Content, News & SEO (the acquisition engine)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|9.1|News & blog sections|Market news + educational articles|★ MVP|all majors|
|9.2|AI auto-news (real-time)|AI drafts relevant market news|★ MVP|Zhaogang AI|
|9.3|AI daily blog post|One grounded article/day|★ MVP|*(your req)*|
|9.4|Editorial approval gate|AI drafts → editor approves → publish (accuracy/SEO safety)|★ MVP|*(ours — guardrail)*|
|9.5|Per-SKU & per-article SEO|SSR, schema, sitemap, clean URLs|★ MVP|category lifeblood|
|9.6|Buying guides|راهنمای خرید per product/use-case|➕ Add|Tata content-to-commerce|
|9.7|Glossary / اصطلاحنامه|Educational + SEO|➕ Add|*(ours)*|
|9.8|Daily market analysis|تحلیل بازار (could feed «همکاری»)|➕ Add|ahangar, Mysteel reports|
|9.9|Video / Aparat content|Short explainers|◇ Future|—|
|9.10|Project/design gallery|For retail builders: inspiration → materials|◇ Future|Tata Aashiyana design library|

---

## 10. Trust & Credibility (designed-in)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|10.1|«چرا فولادنو؟»|Competitive advantages section|★ MVP|*(your req)*|
|10.2|Mill logos — «تأمین‌کنندگان»|فولاد مبارکه، ذوب آهن…|★ MVP|*(your req)*|
|10.3|Customer logos — «مشتریان»|Trust wall|★ MVP|*(your req)*|
|10.4|eNamad / Samandehi / اتحادیه|Iranian trust badges|★ MVP|fooladsell, all|
|10.5|Real address + map + phones|اقدسیه… + ۰۲۱۲۶۲۹۷۵۱۲ + ۰۹۱۲۱۳۹۵۹۵۴|★ MVP|*(your req)*|
|10.6|Reviews / testimonials|نظرات مشتریان|➕ Add|Trustpilot-style (Metals4U)|
|10.7|Price & quality guarantee|ضمانت قیمت و کیفیت (written)|➕ Add|ahanprice warranty|
|10.8|Pre-shipment inspection|بازرسی پیش از ارسال / 3-point check|➕ Add|OnlineMetals, ahanprice|
|10.9|Team / consultants page|Real faces of advisors|➕ Add|ahanonline (100+ consultants)|

---

## 11. Communication & Channels

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|11.1|SMS (Kavenegar)|OTP, پیش‌فاکتور, alerts, callbacks|★ MVP|*(your decision)*|
|11.2|WhatsApp / Telegram / Eitaa|Hand-off + price channels|★ MVP (you want all)|all Iranian channels|
|11.3|Price-alert push|قیمت‌سنج notifications|★ MVP|BigMint|
|11.4|Web push notifications|Re-engage browser visitors|➕ Add|—|
|11.5|Notification center|In-site inbox|◇ Future|—|
|11.6|Telegram/Eitaa price-bot|Auto price replies + alerts|➕ Add|markazeahan channels|

---

## 12. Admin Panel (the operational spine)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|12.1|Fast daily price grid|All SKUs one screen; price + زمان تحویل; auto نوسان; history; **stale flag**; mobile|★ MVP|*(ours — critical)*|
|12.2|Catalog management|Categories/sub/SKUs/specs/images|★ MVP|—|
|12.3|Ticker/billet entry|Admin market values|★ MVP|*(your req)*|
|12.4|Bulk import/export (Excel)|Paste/upload price sheets|➕ Add (MVP)|—|
|12.5|Supplier استعلام log|Record which supplier quoted what (ops aid)|➕ Add|*(ours)*|
|12.6|Scheduled publish|Enter at 10:00, go live 11:00|➕ Add|*(ours)*|
|12.7|CRM / leads pipeline|Work leads with full context, statuses|★ MVP|*(ours)*|
|12.8|Content manager + AI approval|Approve/schedule AI drafts|★ MVP|*(your req)*|
|12.9|Club management|Tiers, members, benefits|★ MVP|—|
|12.10|Brand-asset manager|Mill & customer logos, banners, popups|★ MVP|—|
|12.11|Users & roles + audit log|Granular permissions; change history|★ MVP|—|
|12.12|Analytics dashboard|Price freshness, leads, traffic, funnel|➕ Add (MVP-lite)|—|
|12.13|SMS/notification templates|Editable message templates|➕ Add|—|
|12.14|SEO manager|Meta, redirects, sitemap controls|➕ Add|—|

---

## 13. Cooperation / B2B — «همکاری با ما»

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|13.1|تحلیل بازار|Market-analysis track (lead form + content)|★ MVP|ahangar, Mysteel|
|13.2|تأمین از شما|Sellers offer supply → intake form (Phase 1)|★ MVP|foolad24 supplier side|
|13.3|فروش از ما|Partners/buyers track → lead|★ MVP|*(your req)*|
|13.4|Supplier onboarding|Verified-supplier form (toward marketplace)|◇ Future|foolad24, Zhaogang|
|13.5|Project/bulk quote (B2B)|Large-order RFQ workflow|➕ Add|Moglix, OfBusiness RFQ|

---

## 14. Big Bets / Future (Phase 2–3 & moonshots)

| # | Feature | Description | Priority | Inspired by |
|---|---|---|---|---|
|14.1|Embedded credit/financing|چک/LC/اقساط/BNPL facilitation or captive credit|◇ Future|OfBusiness/Oxyzo, Moglix/Credlix|
|14.2|Logistics & freight integration|Quote + tracking, not manual coordination|◇ Future|Zhaogang 胖猫物流|
|14.3|Two-sided marketplace|Verified third-party suppliers|◇ Future|foolad24, Zhaogang|
|14.4|Mobile app (Cafe Bazaar/Myket)|Native + push alerts|◇ Phase 3|markazeahan, foolad24|
|14.5|Web App dashboard|Saved projects, deeper AI memory, ops|◇ Phase 2|JSW/Moglix|
|14.6|Partner API / EDI|Programmatic prices/orders|◇ Future|thyssenkrupp, OnlineMetals|
|14.7|Export module|English/Arabic for cross-border|◇ Future|ahanonline EN site|
|14.8|Mill-certificate vault|Store/serve آنالیز per order|◇ Future|Reliance/Yarde|

---

## 15. Summary — what's confirmed vs to decide

- **★ MVP (confirmed):** all your described features + the essentials to run them — ticker, full price tables (with charts, Excel, logo-image, print, favorites, زمان تحویل), grounded AI advisor with estimates, وزن‌سنج + پروژه‌سنج, lead/پیش‌فاکتور/CRM/SMS, price alerts, customer club, AI news+blog (with approval), full trust + cooperation pages, and the admin spine.
- **➕ Add — recommend pulling into MVP (cheap, high-value):** VAT toggle (2.10), unit toggle (2.11), quick filter/search (2.14), inquiry cart (2.16), total-cost calculator (5.4), quote-validity countdown (6.7), «طلا و ارز» retention page (1.2), bulk Excel import (12.4).
- **➕ Add — strong for v1.1:** «قیمت ما vs قیمت پایه» (3.4), factory-vs-بنگاه (2.12), reviews (10.6), guarantee (10.7), referral (8.5), Telegram price-bot (11.6), request/order tracking (6.8).
- **◇ Future (v2 / Web App / Mobile / moonshots):** credit, logistics, marketplace, Fooladno Price Index, voice/photo AI, API, export, mill-cert vault, mobile & web apps.

### Your decision needed
1. Confirm the **➕ "recommend pull into MVP"** list — accept all, or trim any?
2. Pick any **◇ Future** items you want promoted to MVP/v1.1.
3. Anything missing you'd like added to the brainstorm?

*Next Layer-2 document after this list is prioritized: Information Architecture & Sitemap.*

*Fooladno — اول مشورت، بعد خرید.*
