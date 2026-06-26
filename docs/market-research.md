# Iron & Steel Trading Platforms — Global Market Research

**Prepared:** 25 June 2026 (1405/04/02)
**Purpose:** Competitive landscape and strategic input for building a website + web app + mobile app for selling iron & steel products (آهن آلات و فولاد) in Iran — benchmarked against the strongest platforms in Iran and worldwide.
**Scope:** Iran (primary), China, India, UK/US/EU, and global steel price-data platforms.

> **Reliability note.** Findings were gathered via multi-source web research with adversarial cross-checking. Many large Iranian sites and the Iranian app stores (Cafe Bazaar/Myket) block US-origin automated fetchers (HTTP 503), so some Iranian on-page details (exact VAT displays, app install counts) come from search snippets and are flagged. Financial figures for private companies are third-party estimates unless stated. Items needing a verification pass are marked **[unverified]**.

---

## 1. Executive Summary

The iron & steel trade is a fragmented, low-margin commodity business with **daily-fluctuating prices**. Across every market studied, the platforms that win do **not** win as thin "list of prices" sites — they win by owning one or more of: **trusted live pricing**, **embedded credit/financing**, **logistics & processing (cut-to-size)**, and a **two-sided or self-operated marketplace** that actually closes transactions.

Key strategic findings:

1. **Iran is a market of hundreds of single-seller SEO price portals, with almost no true two-sided marketplace and almost no real online checkout.** The dominant flow everywhere is: *daily price table → phone/expert inquiry → pro-forma invoice (پیش‌فاکتور) → payment → carrier delivery.* This is the biggest whitespace.
2. **Iranian prices are structurally tied to the بورس کالا (Iran Mercantile Exchange).** A new platform that transparently translates the **bourse base price → factory price → بنگاه (dealer) markup** would solve a real, unmet pain point.
3. **China shows the end-state playbook:** start by aggregating one side (demand or supply), standardize the catalog, then layer self-operated trading → logistics → warehousing/processing → supply-chain finance → SaaS → data. Zhaogang/找钢网 (GMV ~¥153B) is the canonical case.
4. **India shows the most transferable near-term model:** commerce + a captive credit arm (OfBusiness/Oxyzo, JSW One Finance, Moglix/Credlix). Credit is the moat, not an add-on.
5. **UK/US retailers (Metals4U, OnlineMetals, The Metal Store) show the best self-serve UX:** live ex-VAT prices, free online cut-to-size with inline length entry, no minimum order, weight calculators, next-day delivery — applied to a traditionally trade-only commodity.
6. **Price-reporting agencies (Mysteel, SteelOrbis, MEPS, BigMint) show how to display volatile prices** and how a trusted, methodology-transparent price/index layer becomes defensible infrastructure (and a subscription business in its own right).

For a new Iranian entrant, the opportunity is a **mobile-first, trust-anchored platform that combines (a) the best price-display UX, (b) real transactional checkout with human price-confirmation where needed, (c) embedded credit, and (d) integrated logistics** — none of which any single Iranian incumbent does well today.

---

## 2. The Iranian Market (Primary Focus)

### 2.1 How Iranian steel pricing actually works — essential context

Everything in the Iranian market is built on a **three-tier price structure**:

1. **بورس کالا — Iran Mercantile Exchange (IME, ime.co.ir):** the regulated primary market. Mills are required to sell most domestic output here; this sets the official "discovered price" (کشف قیمت). Prices are **formula-linked**:
   - Billet (شمش) base ≈ **88% of export FOB Persian Gulf** at the Nima rate (with a competition cap).
   - Rebar (میلگرد) base ≈ **11% above** weekly billet; beam/angle/channel ≈ **14% above** billet.
   - Hot-rolled sheet (ورق گرم) ≈ **95% of global price**.
   - ([ime.co.ir](https://ime.co.ir/), [price-formula explainer](https://nabzebourse.com/fa/news/110811/))
2. **قیمت کارخانه (factory / ex-works price):** each mill's published gate price.
3. **بازار آزاد / بنگاه (free / broker market):** physical traders and warehouses who resell to small buyers at a markup driven by logistics, VAT, financing, and the **Nima-vs-free-market dollar spread** (which can put bourse prices 30–50% below open-market prices). ([tabnak comparison](https://www.tabnak.ir/fa/news/1310563/))

**Buying on the bourse requires a trading code + licensed broker + minimum tonnage**, so small/medium buyers are locked out. The entire category of "قیمت روز آهن" websites exists to **bridge tiers 1–2 into tier-3 retail**: aggregate bourse + factory prices, publish daily retail tables, and let a buyer order a single beam or 500 kg of rebar with an invoice.

> **Implication for the product:** price discovery and trust are the core jobs-to-be-done. A platform that makes the bourse→factory→بنگاه translation transparent, and updates intraday with the FX move, is solving the market's central pain.

### 2.2 The major mills — do they sell online?

**No consumer e-commerce. Wholesale only, via bourse + registered-customer portals.**

| Mill | Products | Online posture |
|---|---|---|
| **فولاد مبارکه / Mobarakeh Steel** ([msc.ir](https://www.msc.ir/)) | Flat: HRC/CRC, galvanized, colored sheet | Sells on IME bourse + registered-customer "فروش داخلی" portal (pre-invoice → order → invoice). No public cart. TSE: فولاد |
| **ذوب آهن اصفهان / Esfahan Steel** ([esfahansteel.ir](https://www.esfahansteel.ir/)) | Long/structural: rebar, wire rod, IPE/H/INP beams, angles, channels | Catalog + separate B2B sales portal ([newsales.esfahansteel.ir](https://newsales.esfahansteel.ir/)). Daily ESCO factory prices republished everywhere |
| **فولاد خوزستان / Khouzestan Steel** ([ksc.ir](https://www.ksc.ir/)) | Billet/شمش (benchmark) | Bourse-centric; pure upstream B2B. TSE: فخوز |

The mills deliberately leave **retail distribution and price-publishing to third-party platforms** — which is the space this project competes in.

### 2.3 Leading Iranian price/trading platforms

| Platform | URL | Model | Pricing UX | Ordering / Payment | App | Trust |
|---|---|---|---|---|---|---|
| **آهن آنلاین (Ahan Online)** | [ahanonline.com](https://ahanonline.com/) | Aggregator portal **+ direct supplier**, since 1386. Broadest catalog; ~100+ sales consultants; English site | Daily قیمت روز, **both کارخانه & بنگاه** levels, rebar per-kg, beams per-شاخه, **price-chart archive** | Inquiry + factor, expert-assisted; credit incl. LC-backed میلگرد اعتباری | None first-party confirmed | Claims eNamad; Telegram/IG/LinkedIn |
| **آهن پرایس (Ahan Price)** | [ahanprice.com](https://ahanprice.com/) | **Lead-gen / SEO front for a direct seller** — branch of فولاد حامیران (Hamiran Steel) | Daily tables **by factory/brand**, per-kg, **weight calc + history**; shows **10% VAT inclusive** | Hybrid → effectively call-based (factor → pay); heavy **credit: cheque/LC/installments** | None found | Leans on Hamiran parent; IG ~60K, Telegram |
| **مرکزآهن (Markaze Ahan)** | [markazeahan.com](https://www.markazeahan.com/) | Direct seller + price portal, since 1387; strong Isfahan pricing; credit sales | Daily قیمت روز + **live news feed**, per-kg & per-piece, billet, weight tools | Online order registration + tracking; cash or credit; factor | **Clearest app footprint** — Cafe Bazaar + Myket + iOS | Telegram; "most credible Isfahan source" |
| **فولادسل (Fooladsell)** | [fooladsell.com](https://fooladsell.com/) | B2B aggregator + direct seller, "quick price inquiry," since 1389; Mobarakeh/Zob Ahan partner | Daily updates, **30-day trend charts**, factory + market rates | **No checkout** — inquiry → pre-invoice → cash/LC → QC → 1–3 day delivery | — | **eNamad + Samandehi + Chamber of Commerce** displayed |
| **فولاد۲۴ (Foolad24)** | [foolad24.com](https://foolad24.com/) | **Confirmed two-sided marketplace** — catalog, daily prices, **bourse offering announcements**, supplier inventory + buyer RFQs, supplier directory | Daily + bourse data | RFQ / supplier-buyer matching | **Android + iOS** | Samandehi |
| **اصفهان آهن (Esfahan Ahan)** | [esfahanahan.com](https://esfahanahan.com/) | "First online iron shop"; **true online checkout** | Live prices | **Pro-forma factor in <3 min, pay online, 24/7**; sells billet | — | Strong IG/Telegram + English export |
| **آهنک (Ahanak)** | [ahanak.com](https://ahanak.com/) | "First iron startup"; online payment + cash | Per-kg factory selling | **Online payment** | **Cafe Bazaar app** | — |
| **سامانه آهن (Samaneahan)** | [samaneahan.com](https://samaneahan.com/) | **Price-comparison metasearch** — aggregates thousands of بنگاه (closest to true two-sided) | Compare across dealers | Compare-only (no checkout) | **Cafe Bazaar app** | — |
| **ahaninfo.ir** | [ahaninfo.ir](https://www.ahaninfo.ir/) | Price reference showing **live bourse data** (offering date, base price, weighted-avg close, volume) + bourse education | Bourse-linked tables | Reference | — | — |
| **Others** | ahangar.com, modiranahan.com, ahansearch.com, ahan724.com, ahanmelal.com, ahanpakhsh.com, fooladiranian.com, polad.ir, ahan100.com, ahan1.com, shahrahan.com | قیمت روز portals / sellers; some with payment gateways (ahansearch, ahan724); deep SKU price tables (modiranahan); market analysis (ahangar) | varies | mostly inquiry; a few with درگاه پرداخت | several Cafe Bazaar apps | varies |

**App distribution reality:** Google Play is largely irrelevant in Iran due to sanctions. Real distribution is **Cafe Bazaar + Myket** (plus iOS sideload/AppStore where possible). Confirmed apps: markazeahan, samaneahan, ahanak, ahangar (Asroon), foolad24. Exact install counts were not retrievable (store pages 503'd). **[unverified counts]**

### 2.4 Iranian market — common patterns

- **Standardized price UX sector-wide:** daily قیمت روز tables keyed to the Jalali date; **rebar/wire per-kg by size+factory**, **beams/profiles per-شاخه**; **کارخانه vs بنگاه** levels; update window roughly **Sat–Wed ~11:00–14:00**, static on Thursdays/holidays. Price charts/history are the main differentiator.
- **"Online" rarely means self-serve checkout.** Because prices move intraday, a human confirms the final price. Genuine online-checkout exceptions are the minority (esfahanahan, ahanak, ahansearch, ahan724).
- **Credit is a core product, not an add-on:** LC (اعتبار اسنادی), post-dated cheques (چک صیادی), deed collateral, installments — because buyers are cash-constrained contractors.
- **Most "aggregators" are captive seller channels** (ahanprice = Hamiran's funnel). The only structurally two-sided models found are **samaneahan** (compare) and **foolad24** (RFQ marketplace).
- **Trust stack:** eNamad (نماد اعتماد الکترونیکی) + Samandehi badges, long tenure dates as credibility, mill partnerships cited, and Telegram/Instagram/Eitaa price channels as social proof.

### 2.5 Iranian market — gaps & opportunities (the whitespace)

1. **No dominant true marketplace with real online checkout + escrow.** Hundreds of single-seller SEO portals; samaneahan is compare-only, foolad24 is RFQ. A trusted two-sided marketplace with instant verified pricing, real checkout, and buyer protection is underbuilt.
2. **Bourse-to-retail price translation is opaque.** Buyers can't easily see bourse base price vs بنگاه markup. ahaninfo's bourse-data display is a rare differentiator.
3. **VAT/price transparency is inconsistent** — some show inclusive 10%, many don't display VAT on-page.
4. **Logistics/freight is bolted-on, not integrated** — manual carrier "coordination"; integrated freight quoting/tracking is rare.
5. **Weak mobile-native experiences** — most apps are price-list viewers, not full transactional + credit + tracking apps.

---

## 3. Global Benchmarks

### 3.1 China — the full-stack B2B playbook (the end-state)

China built the world's only mature, full-stack steel platform economy. The winning model is **not** a thin matching marketplace — it is a vertically integrated stack: **spot marketplace → logistics → warehousing/processing → supply-chain finance → SaaS → data/analytics.**

- **Zhaogang.com / 找钢网 (ZG Group, HKEX 6676; listed Mar 2025 via de-SPAC)** — the canonical case, with a crucial cautionary twist.
  - **Evolution:** (1) free information/matching 2012–13 → (2) **self-operated trading** (taking title to capture spread & guarantee quality) 2013–16 → (3) full stack: logistics (胖猫物流), warehousing/processing, supply-chain finance (胖猫白条), trader SaaS (胖猫云), big-data → **(4) asset-light pivot "三不做" (2019→2023): no self-operation, no owned logistics/warehousing, no own lending.**
  - **The big lesson — gross revenue is a vanity trap.** Under self-operation ZG booked **~¥17.5B revenue (2017) at ~2.8% margin** with heavy inventory/price risk; after a **failed 2018 IPO** it wound down self-op (done by end-2023) and switched to **net commission + services**, so reported revenue fell ~15× to ~¥1B while **gross margin jumped to ~32%** and GMV kept rising (GMV ~¥188–195B, ~49–51M tonnes in 2023–24).
  - **It killed its highest-margin line (supply-chain finance, ~83% gross margin) before IPO** to de-risk — credit risk on a volatile commodity book wasn't worth it.
  - **Sobering public-market result:** listed via Hong Kong's first de-SPAC at ~HK$10 (≈$1.3B equity value), but the **stock is down ~95% (≈HK$0.48, June 2026)** — a thin-margin B2B platform struggled once public. *(Verify no share consolidation.)*
  - **Net read:** the *vertically integrated* model built the liquidity flywheel, but the *durable* version is **asset-light orchestration** (third-party carriers/warehouses/lenders), profitability before scale, and net (not gross) revenue. Internationalization (Dubai +674% YoY) is its current growth story.
- **Ouyeel / 欧冶云商** — mill-backed (Baowu) incumbent; **online auction of mill inventory** is its core mechanic; supply-anchored but thin margins (<2%); IPO withdrawn 2024 over independence concerns.
- **Steel Bank / 钢银电商 (NEEQ 835092)** — finance-led; spot consignment trading + heavy supply-chain finance ("a bank for steel"); **consistently profitable** — proof that profit comes from finance/settlement discipline, not GMV vanity.
- **Mysteel / 我的钢铁网 (parent 上海钢联, SZSE 300226)** — the neutral **data/price layer** (see §3.5). Same group owns both the data layer (Mysteel) and a trading layer (Steel Bank) — a powerful combination, kept as separate entities to preserve benchmark neutrality.
- **Horizontal platforms (Alibaba.com, 1688, Made-in-China)** host steel *suppliers* but never won commodity *spot trading* — they lack real-time regional spot pricing, heavy-freight logistics, warehousing, inventory finance, and grade/settlement standardization.

**Transferable lessons:** standardize the catalog first; lead with **data or finance**, not just matching; pick a wedge (own supply via mill JV, or own demand via trader aggregation); profit discipline beats GMV; a neutral price/data layer is foundational.

### 3.2 India — commerce + embedded credit (most transferable near-term)

India pioneered attaching **working-capital credit** directly to B2B steel commerce.

| Platform | Model | Pricing | Credit (the moat) | Notes |
|---|---|---|---|---|
| **OfBusiness / OFB Tech** | Aggregator **+ manufacturer + lender**; "India's largest B2B raw-materials + credit platform" | **Live city-wise daily price tables** (per-tonne, % change, timestamp) + RFQ; app has interactive graphs | **Oxyzo** captive NBFC (>70% owned, unicorn 2022): purchase/work-order finance, invoice discounting | Profitable at scale: FY25 rev ~₹22,241 Cr; dedicated steel-price app (1L+ installs) + BidAssist |
| **JSW One MSME** | Tech-first B2B marketplace + distribution + finance (JSW Group) | **RFQ / quote-on-request** (gated, not a public ticker) | **JSW One Finance** captive NBFC + BNPL + LC/BG | Unicorn ~$1B (2025); iOS app actively maintained |
| **Moglix / Credlix** | Multi-category B2B marketplace; steel one vertical (SAIL/JSW/RINL/AM-NS) | Posted prices (MRO) + RFQ (steel) | **Credlix** SCF: vendor finance, invoice/PO discounting | Unicorn, ~$2.6B; FY25 rev ~$680M; 1M+ app installs |
| **Tata Steel Aashiyana** | **Manufacturer-direct D2C, content-to-commerce** for individual home builders (IHBs) | **Fixed retail catalog, pincode real-time price, Buy Now**; Tiscon daily city price page | Card EMI only (shallow) | FY25 GMV ~₹3,550 Cr; 1.1 lakh users, 24 countries (diaspora); strong design tools |
| **Tata DigECA / Steelium / Nest-In** | Mfr-direct: DigECA (B2MSME online+negotiate), Steelium (branded CR via distributors), Nest-In (modular construction) | DigECA online pricing+negotiate; Tiscon public rate tables | Tata Capital channel finance | DigECA relaunched Jun 2025, 2,000+ ECA customers |
| **Mjunction (Tata+SAIL JV)** | **E-auction** transaction platform (forward + reverse); "world's largest e-marketplace for steel & coal" | **Auction-discovered**, per-event | financejunction: buyer/channel finance (₹25,000 Cr+ arranged) | ~₹1.5 lakh Cr GMV/yr; institutional/PSU; web-portal, no notable app |
| **BigMint (ex-SteelMint)** | **Price-reporting agency** / data subscription (see §3.5) | **Tickers + % arrows + interactive charts + index tables + push alerts** | None | IOSCO-aligned; app-first (Android+iOS); 4,000+ benchmark clients |

**Key India lessons:** (1) **embedded captive-NBFC credit is the strongest moat** (OfBusiness/Oxyzo outperformed third-party SCF models like Bizongo, which blew up). (2) Two clean audience splits: **MSME/contractor B2B** (JSW, Moglix) vs **individual home builder retail** (Aashiyana). (3) Even the leaders lack a true live price ticker with alerts on the *commerce* side — a recognized whitespace BigMint fills on the *data* side.

> **Cautionary tale:** Bizongo (3rd-party embedded SCF, all founders exited, EOW fund-misappropriation complaint, heavy contraction) shows the risk of a finance model you don't control.

### 3.3 UK / US / EU — self-serve cut-to-size e-commerce & digital marketplaces

**Best-in-class self-serve UX (the model to copy for the storefront):**

- **Metals4U (UK)** — "UK's first online metal retailer." Live **ex-VAT prices**, **free online cut-to-size with inline length entry** (50mm min, ±3mm tolerance), **no minimum order**, automated bulk discounts (5%/10% tiers), price-match promise, next-day delivery, free delivery over a threshold. Serves **DIY + SME long tail** that traditional stockholders ignored. Trustpilot ~4.7–4.8.
- **OnlineMetals.com (US, owned by thyssenkrupp/tk accelis)** — **instant transparent online prices**, exact cut-to-size pricing with **no minimum**, ~60–70k SKUs, material selector, 24/7 self-service. Runs on SAP Commerce Cloud. Launched the **first B2B industrial-metals marketplace on Mirakl** (2023; +419% GMV in year one), positioned to beat Amazon Business on custom-cut + freight. **API-embedded pricing** (Paperless Parts) injects prices into machine-shop quoting tools.
- **The Metal Store (UK)** — live prices in **both ex- and inc-VAT columns**, self-serve cut-to-size builder, no minimum, next-day on 3,000+ lines, customer-selectable delivery date, **first-party iOS + Android apps** (the only confirmed consumer apps among the pure retailers).
- **Metal Supermarkets** — world's largest small-quantity metal supplier (100+ physical stores) + online cut-to-size; omnichannel.
- **ParkerSteel (UK)** — stockholder with real transactional storefront: in-basket live pricing, 6PM next-day cutoff, postcode delivery checker, tube-laser configurator.

**Large distributors (relationship/quote-driven, NOT digital-first):**

- **Reliance, Inc. (US)** — largest N. American service center; FY2025 sales **$14.3B**. Moat is **physical/operational** (≈310 locations, 100k+ products, value-added processing on ~50% of orders, sub-24h delivery on ~40%). Its dedicated e-commerce brand **FastMetals was discontinued (May 2026)** and folded into a subsidiary — i.e., scale incumbent, not a digital play.
- **thyssenkrupp Materials Services → "tk accelis"** (spinning off, Frankfurt listing planned 2026) — "Materials-as-a-Service"; **"alfred" AI** for dynamic pricing/inventory/logistics at scale; EDI/VMI for enterprise; OnlineMetals as its digital-native arm.
- **Esmark Steel Group (US)** — traditional service center, **no online pricing/portal/app** — a contrast point.

**Digital marketplace plays (the "Amazon for steel" attempts):**

- **Klöckner & Co / XOM Materials** — century-old trader rebuilding as a platform; **XOM (founded 2017, Berlin)** is an open, neutral B2B marketplace for steel/metals/plastics with heavy ERP/logistics integration; kloeckner.i runs AI-driven shops.
- **Reibus (US)** — independent metals marketplace; raised ~$75M Series B (SoftBank Vision Fund 2), ~$750M valuation.
- **Verdict:** **No one outside China has faithfully replicated the full-stack model at scale.** Reibus (most-funded, ~$131M) **retrenched and pivoted toward logistics**; Felux stalled; Bryzos ("buy steel in <60 seconds" with real delivered instant prices) is the sharpest instant-pricing UX but near-bootstrapped. The only profitable, scaled replication of the *core* economics (marketplace + captive credit) is **OfBusiness (India)**. Western winners are instead **narrow asset-light specialists** (Xometry in custom fabrication; Metalshub, Metaloop). Barriers: less fragmentation to disintermediate, mature existing credit/freight infrastructure, entrenched service-center incumbents, and the 2022–24 funding winter.

### 3.4 Why pure digital steel marketplaces keep failing in the West (critical caution)

The single most important strategic finding from the global scan: **the neutral "Amazon-for-steel" marketplace has not worked at venture scale anywhere in the West.** As of mid-2026:

- **Reibus** (most-funded, ~$131M, SoftBank-backed) **shut its metals marketplace in June 2025** and survives only as a freight broker; assets sold to Hedron (Jan 2026).
- **Felux** (~$24.6M) **pivoted away from the marketplace** to "demand intelligence" CRM/analytics SaaS for service-center sales teams.
- **XOM Materials** (Klöckner's neutral spin-out) **missed its €1B GMV target** and quietly repositioned from open marketplace to **eShop/eProcurement SaaS**.
- **Klöckner & Co** itself — the most aggressive incumbent digitizer — was **taken over by Worthington Steel (~62%, June 2026)** and is heading to delisting.

**Why it's structurally hard:** (1) take rates on a commodity are too thin to fund the heavy ops/credit a managed marketplace needs; (2) steel is bought on entrenched relationships, credit history, and metallurgical/quality assurance — brutal cold-start liquidity problem; (3) heavy oversized **freight is the real cost and the real moat** (it's the one business Reibus *kept*); (4) the managed/principal model is balance-sheet-intensive and lethal when steel prices whipsaw; (5) grade/gauge/tolerance/cert fragmentation resists standardized SKU listings, so RFQ/negotiation persists.

**What actually survives (in order of durability):** data/pricing/index layer → procurement/SaaS layer → **embedded fintech/net-terms** (Bryzos: "buy steel in 60 seconds," free net-60 to buyers) → **logistics/freight** → **incumbent-/mill-backed, auction-led marketplaces** (mjunction, OnlineMetals-on-Mirakl, captive distributor shops, Vanilla Steel's auctions for illiquid excess).

> **One-line thesis: in steel, the marketplace is not the business — the services around it are.** For an Iranian entrant this argues *against* betting everything on a thin-margin neutral marketplace, and *for* anchoring on trust/price-data + a real sell-side relationship + credit + logistics. Iran's structural conditions (fragmented بنگاه market, weak SME credit, bourse-driven opacity) actually resemble China/India pre-platform more than the consolidated West — which is exactly where the model *has* worked (Zhaogang, OfBusiness).

### 3.5 Steel price-data / index platforms (how to display volatile prices)

These are the reference designs for **pricing UX** and for a potential **subscription data product**.

| Platform | What it sells | How prices are shown | Model |
|---|---|---|---|
| **Mysteel / 我的钢铁网** | China's dominant PRA; ~80% of Chinese steel contracts reference its prices | Survey-based daily indices (rebar, HRC, iron ore PORTDEX), real-time terminal, MySpic composite; fixed daily fixings | Subscription data + reports + consulting; **first Chinese PRA with IOSCO assurance** |
| **SteelOrbis** | Global steel prices, news, indices | Daily price reports, **graphs/charts, historical prices**, + a supplier marketplace | Subscription |
| **MEPS International** | World steel price data/forecasts | **Index tables showing relative change** (base Jan 1997 = 100), weighted averages by region, monthly updates | Subscription portal |
| **Fastmarkets / CRU / Platts (S&P) / Argus / Kallanish** | Global benchmark assessments (incl. seaborne iron ore) | Daily assessments, charts, historical series; PRAs sit upstream of futures settlement | Subscription/enterprise |
| **BigMint (India)** | India + global price assessments | **Live tickers with up/down arrows + % change, interactive charts, index tables, push alerts** | Freemium app + subscription tiers |

**Best practices for displaying daily fluctuating prices** (synthesized):

- **Tabular rate tables** keyed to date, with **% change and directional arrows** vs. previous period (BigMint, OfBusiness).
- **Interactive historical charts** (30-day trend minimum; longer archives as a premium/trust feature).
- **Timestamps on every price** ("updated 2h ago") to signal freshness — critical for trust in a volatile market.
- **Push notifications / price alerts** (app-side) — a high-stickiness feature few Iranian players offer.
- **Freemium gating:** free public price pages for SEO/top-of-funnel + reputation; deeper data/alerts/API behind login or subscription.
- **Methodology transparency** builds benchmark credibility (IOSCO assurance is the gold standard for institutional adoption).

---

## 4. Cross-Cutting Feature Taxonomy

What a complete iron/steel platform can offer, ranked by how decisive each is:

**Tier 1 — table stakes / trust**
- Daily price tables by product × size × grade × factory, per-kg and per-piece (per-شاخه), with **کارخانه vs بنگاه** levels
- % change + directional arrows + freshness timestamp
- Weight calculator (per profile/shape)
- eNamad + Samandehi trust badges, clear company identity, real address/phone
- Telegram/Instagram/Eitaa price channels

**Tier 2 — differentiation**
- Interactive price history/charts + market analysis content
- **Bourse (بورس کالا) price linkage & transparency** (base price, offering announcements, weighted-avg close) — rare, high-value
- Real online checkout with **human price-confirmation step** (handles intraday volatility)
- Pro-forma invoice (پیش‌فاکتور) as PDF; VAT shown inclusive
- Mobile app (Cafe Bazaar + Myket) with order tracking + push price alerts

**Tier 3 — moat**
- **Embedded credit** (cheque/LC/installments/BNPL) — the India lesson; biggest stickiness driver for cash-constrained contractors
- **Integrated logistics/freight** quoting + tracking (not manual coordination)
- **Two-sided marketplace** with verified suppliers + escrow/buyer protection
- Value-added **cut/process services** + self-operated inventory (the China lesson)
- Data/subscription layer (alerts, API, analytics) as a separate revenue line

---

## 5. Strategic Recommendations for a New Iranian Entrant

> Framed as inputs for the brainstorm — directional, to be refined against your goals, capital, and supplier relationships.

1. **Pick a wedge, then layer.** The two proven entry wedges (China): **own demand** (aggregate buyers via the best price-display + lead-gen, like Zhaogang's start) or **own supply** (lock mill/بنگاه partnerships). Given the Iranian market is buyer-starved for trust and transparency, **lead with demand: become the most trusted price + buying experience**, then layer trading, credit, and logistics.

2. **Differentiate on trust & transparency, not just "قیمت روز."** Every competitor has a daily price table. Win with: **bourse→factory→بنگاه price translation**, freshness timestamps, % change, transparent VAT, and clear escrow/guarantee — the things ahaninfo/fooladsell only partially do.

3. **Mobile-first, on Cafe Bazaar + Myket** (not Google Play). markazeahan is the only incumbent with a strong app; the bar is low. Build a full transactional app with **push price alerts**, order tracking, weight tools, and credit — not just a price viewer.

4. **Make checkout real but volatility-aware.** Copy the UK self-serve UX (browse → configure size → cart) but insert a **price-lock / expert-confirm step** (e.g., 3% deposit locks the price until 11:00 next day — a pattern already used by some Iranian sellers). This bridges "real e-commerce" with "prices move intraday."

5. **Treat credit as a product from day one.** The single biggest moat in India. Offer cheque (چک صیادی), LC, and installment options with a clear credit-assessment flow; this is what converts contractors.

6. **Integrate logistics.** Freight is a major cost and pain; integrated quoting + tracking is a real differentiator vs. the manual "coordination" everyone else does.

7. **Consider a data/subscription layer later.** A trusted, methodology-transparent price index (Mysteel/BigMint model) can become both a trust anchor and a separate revenue line — and feeds your trading/credit flywheel.

8. **Audience choice matters.** Decide between **B2B contractor/project focus** (bigger tickets, credit-driven — like JSW/Moglix/OfBusiness) vs **retail/individual builder focus** (transparent retail pricing + tools — like Tata Aashiyana). They imply different UX, content, and credit models. A phased approach can start B2B-lead-gen and expand to retail self-serve.

---

## 6. Open Questions for the Brainstorm (طوفان فکری)

To shape the product, the key decisions to make together:

- **Business model:** pure price-aggregator/lead-gen, direct seller, two-sided marketplace, or hybrid?
- **Audience:** B2B contractors/projects, retail/individual builders, or both (phased)?
- **Inventory posture:** asset-light (matching/lead-gen) vs self-operated (take title — capital-heavy but captures spread)?
- **Geography:** national, or anchor on a hub first (Tehran/Shadabad market, or Isfahan mills)?
- **Credit:** offer from day one? Own balance sheet, partner, or facilitate only?
- **Logistics:** integrate freight, or partner/coordinate?
- **Monetization:** seller commissions, lead fees, spread, subscription/data, financing margin, or a mix?
- **Differentiator:** which one wedge do we win on first — trust/price-transparency, credit, logistics, or selection?

---

## Appendix — Source Index (selected)

**Iran:** [ime.co.ir](https://ime.co.ir/) · [ahanonline.com](https://ahanonline.com/) · [ahanprice.com](https://ahanprice.com/) · [markazeahan.com](https://www.markazeahan.com/) · [fooladsell.com](https://fooladsell.com/) · [foolad24.com](https://foolad24.com/) · [esfahanahan.com](https://esfahanahan.com/) · [ahanak.com](https://ahanak.com/) · [samaneahan.com](https://samaneahan.com/) · [ahaninfo.ir](https://www.ahaninfo.ir/) · [msc.ir](https://www.msc.ir/) · [esfahansteel.ir](https://www.esfahansteel.ir/) · [ksc.ir](https://www.ksc.ir/)

**China:** [Zhaogang/ZG Group](https://m.mp.oeeee.com/a/BAAFRD0000202503131059098.html) · [Steel Bank 835092](https://xinsanban.eastmoney.com/f10/835092.html) · [上海钢联 FY2024](https://stcn.com/article/detail/1640045.html) · [Mysteel methodology](https://www.mysteel.net/methodology/) · [Ouyeel IPO withdrawal](https://www.21jingji.com/article/20240712/herald/9b68d6705923a1ca72c5a7e5b0a9f332.html)

**India:** [OfBusiness](https://www.ofbusiness.com) · [Oxyzo](https://www.oxyzo.in) · [JSW One](https://www.jswonemsme.com/) · [Moglix](https://business.moglix.com/) · [Tata Aashiyana](https://aashiyana.tatasteel.com/) · [Mjunction](https://www.mjunction.in/) · [BigMint](https://www.bigmint.co/)

**UK/US/EU:** [Metals4U](https://www.metals4u.co.uk/) · [OnlineMetals](https://www.onlinemetals.com/) · [The Metal Store](https://www.themetalstore.co.uk/) · [ParkerSteel](https://www.parkersteel.co.uk/) · [Reliance](https://reliance.com/) · [thyssenkrupp/tk accelis](https://www.thyssenkrupp-materials-services.com/) · [XOM Materials](https://en.wikipedia.org/wiki/XOM_Materials) · [Reibus](https://www.prnewswire.com/news-releases/reibus-secures-75m-series-b-funding-to-further-revolutionize-the-metals-supply-chain-ecosystem-301434391.html)

**Price data:** [SteelOrbis](https://www.steelorbis.com/) · [MEPS](https://mepsinternational.com/) · [Fastmarkets](https://www.fastmarkets.com/) · [Mysteel](https://www.mysteel.net/)
