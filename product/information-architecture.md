# Poladin — Information Architecture (IA)
## Layer 2 · Product Design — Document 9 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** all prior Layer-2 docs.
**Purpose:** Define how every piece of content is **organized, labeled, navigated, and addressed (URLs)** — the structural backbone that the UI, routing, and SEO are built on. This is the most consequential Layer-2 document.

### IA principles
1. **Dual-mode access** — content reachable two ways: **guided** (AI/search) and **structured** (rail/menu/taxonomy).
2. **SEO-first** — every priceworthy node is its own indexable URL with Persian, search-aligned slugs (people search «قیمت میلگرد»).
3. **Shallow & predictable** — max 3 taxonomy levels to any price (Category → Sub-category → SKU).
4. **RTL/Persian-native** — labels, slugs, breadcrumbs all Persian; Jalali/Toman.
5. **No orphan content** — everything is reachable from nav + linked contextually; nothing is a dead-end.

---

## 1. Content Model & Taxonomy

### 1.1 Top-level content domains
```
Poladin
├─ قیمت‌ها (Prices)        → catalog taxonomy (the core)
├─ پولادین (AI advisor)    → conversational findability
├─ بازار (Market)          → نبض بازار / طلا و ارز
├─ ابزارها (Tools)         → وزن‌سنج، پروژه‌سنج، محاسبه‌گرها
├─ محتوا (Content)         → وبلاگ، اخبار، راهنماها، اصطلاحنامه
├─ تعامل (Engagement)      → سبد استعلام، درخواست/پیش‌فاکتور، هشدارها، باشگاه
├─ شرکت (Company/Trust)    → چرا پولادین، درباره، تماس، تأمین‌کنندگان، مشتریان
├─ همکاری (Cooperation)    → تحلیل بازار، تأمین از شما، فروش از ما
├─ حساب (Account)          → علاقه‌مندی، درخواست‌ها، هشدارها، پروفایل، باشگاه
└─ ادمین (Admin)           → operational back office
```

### 1.2 Product taxonomy (complete — 7 categories → sub-categories)
> Each **Sub-category** renders a price table; each **SKU** = a specific (نوع × سایز × گرید × کارخانه).

| # | Category «دسته» | Sub-categories «زیر‌دسته» |
|---|---|---|
| 1 | **میلگرد** (Rebar) | میلگرد آجدار · میلگرد ساده · کلاف (آجدار/ساده/کششی) |
| 2 | **تیرآهن** (I-Beam) | IPE (معمولی) · هاش/H (سبک HEA / سنگین HEB) · INP · لانه‌زنبوری |
| 3 | **پروفیل** (Profile/Hollow) | قوطی و پروفیل (ساختمانی/صنعتی) · پروفیل ستونی (Z) · پروفیل درب و پنجره (۵۰۷/۵۰۸/۵۰۹) · سپری |
| 4 | **ورق گرم** (Hot-rolled) | ورق سیاه (HR) · ورق آجدار · ورق st37/st52 · ورق ضخیم (اکسین/کاویان) |
| 5 | **ورق سرد** (Cold-rolled & coated) | ورق روغنی (CRC) · ورق گالوانیزه · ورق رنگی · ورق قلع‌اندود |
| 6 | **نبشی و ناودانی** (Angle & Channel) | نبشی (بال‌مساوی/نامساوی) · ناودانی (UNP/U) |
| 7 | **لوله** (Pipe) | لوله سیاه/درزدار · لوله گالوانیزه · لوله مانیسمان (مانیسمان) · لوله اسپیرال · لوله گاز · لوله داربست · لوله صنعتی |

> *Taxonomy is admin-editable;* this is the launch structure (benchmarked on ahanprice/ahanonline, normalized).

### 1.3 Faceting / attribute taxonomy (filters within a sub-category)
| Facet | Applies to | Example values |
|---|---|---|
| **سایز / قطر** | all | ۸، ۱۰…۳۲ (میلگرد)؛ ۱۲…۳۰+ (تیرآهن)؛ "۲ اینچ" (لوله) |
| **ضخامت** | ورق، لوله، پروفیل | mm |
| **استاندارد/گرید** | all | A2/A3/A4؛ st37/st52؛ HEA/HEB |
| **کارخانه/برند** | all | ذوب‌آهن، فولاد مبارکه، ظفربناب، میانه… |
| **حالت/طول** | all | شاخه ۱۲m / کلاف / برگ / فابریک / بُرشی |
| **واحد قیمت** | all | کیلویی / شاخه / برگ (toggle) |

### 1.4 Content entities & relationships (IA view; full schema in the data-model doc)
```
Category 1─* SubCategory 1─* SKU 1─* PricePoint(history)   SKU 1─1 currentPrice + زمان‌تحویل
SKU *─* User(Favorites)     SKU *─* Alert                  InquiryCart *─* SKU
Lead 1─* LineItem(→SKU)     Lead 1─1 پیش‌فاکتور             User 1─0..1 ClubMembership(tier)
Article *─* SKU/Category(related)   MarketValue(ticker) 1─* history
PartnerLogo / CustomerLogo (brand assets)   AuditEntry (any change)
```

---

## 2. Sitemap (complete) — Public

```
/                                   خانه (dual-mode home)                  [Home]
/قیمت                                صفحهٔ همهٔ دسته‌ها / قیمت روز            [PriceHub]
  /قیمت/میلگرد                        دستهٔ میلگرد                           [Category]
    /قیمت/میلگرد/اجدار                زیر‌دستهٔ میلگرد آجدار (جدول قیمت)       [SubCategory/Table]
      /قیمت/میلگرد/اجدار/میلگرد-14-a3-ذوب-اهن   صفحهٔ SKU + نمودار          [SKU]
    /قیمت/میلگرد/ساده
    /قیمت/میلگرد/کلاف
  /قیمت/تیراهن                        … (IPE/هاش/INP/لانه-زنبوری)            [Category]
    /قیمت/تیراهن/ipe …
  /قیمت/پروفیل   /قیمت/پروفیل/قوطی …
  /قیمت/ورق-گرم  /قیمت/ورق-گرم/سیاه …
  /قیمت/ورق-سرد  /قیمت/ورق-سرد/روغنی · /گالوانیزه · /رنگی …
  /قیمت/نبشی-ناودانی  /نبشی · /ناودانی …
  /قیمت/لوله     /قیمت/لوله/سیاه · /مانیسمان · /گالوانیزه …
/پولادین                              دستیار هوش مصنوعی (full view)          [AI]
/طلا-و-ارز                            بازار طلا و ارز (tgju)                 [Market]
/ابزار/وزن                            وزن‌سنج                                [Tool]
/ابزار/براورد-پروژه                   پروژه‌سنج                              [Tool]
/ابزار/محاسبه-هزینه                   محاسبه‌گر هزینه                        [Tool]
/سبد-استعلام                          سبد استعلام                           [Cart]
/درخواست                              ثبت درخواست / پیش‌فاکتور (flow)         [RequestFlow]
/ورود                                 ورود/ثبت‌نام با موبایل+OTP             [Auth]
/حساب                                 داشبورد حساب                          [Account]
  /حساب/علاقه‌مندی  /حساب/درخواست‌ها  /حساب/هشدارها  /حساب/پروفایل  /حساب/باشگاه
/باشگاه                               باشگاه پولادین                        [Club]
/وبلاگ            /وبلاگ/{slug}        وبلاگ + مقاله                         [BlogList/Article]
/اخبار            /اخبار/{slug}        اخبار بازار + خبر                     [NewsList/Article]
/راهنما           /راهنما/{slug}       راهنمای خرید (v1.1)                   [Guide]
/اصطلاحنامه                            واژه‌نامه (v1.1)                       [Glossary]
/چرا-پولادین                          چرا پولادین؟                          [Why]
/درباره-ما                            درباره ما                             [About]
/تماس                                 تماس با ما (آدرس/تلفن/نقشه/فرم)        [Contact]
/همکاری                               هاب همکاری                            [CoopHub]
  /همکاری/تحلیل-بازار  /همکاری/تامین  /همکاری/فروش                          [CoopTrack]
/جستجو?q=                             نتایج جستجو                           [Search]
/قوانین   /حریم-خصوصی                  صفحات حقوقی                           [Legal]
/404  /500                            صفحات خطا                             [Error]
sitemap.xml  robots.txt                                                    [SEO]
```

### Sitemap — Admin (`/admin`, role-gated)
```
/admin                    داشبورد (تازگی قیمت، لیدها، ترافیک)               [ADM/all]
/admin/pricing            قیمت‌گذاری روزانه (grid + stale)                  [OP]
/admin/catalog            کاتالوگ: دسته‌ها/زیر‌دسته/SKU/مشخصات/تصاویر        [CM]
/admin/market             تیکر و بازار: شمش + پیکربندی tgju                 [OP/ADM]
/admin/leads              درخواست‌ها / CRM (kanban)                         [SA]
/admin/content            محتوا: صف تأیید پیش‌نویس AI، مقالات، اخبار         [CE]
/admin/club               باشگاه: سطوح/مزایا/اعضا                           [ADM]
/admin/assets             رسانه/برند: لوگوها، بنرها، پاپ‌آپ                  [ADM]
/admin/users              کاربران و نقش‌ها                                  [ADM]
/admin/settings           تنظیمات: SMS/کانال‌ها/SEO/ثوابت (VAT…)            [ADM]
/admin/analytics          گزارش‌ها و قیف                                    [ADM]
/admin/audit              لاگ ممیزی (جستجو بر اساس کاربر/موجودیت/تاریخ)      [ADM]
```

---

## 3. URL / Routing Scheme

### 3.1 Patterns
| Page type | Pattern | Example |
|---|---|---|
| Home | `/` | `/` |
| Price hub | `/قیمت` | `/قیمت` |
| Category | `/قیمت/{دسته}` | `/قیمت/میلگرد` |
| Sub-category (table) | `/قیمت/{دسته}/{زیردسته}` | `/قیمت/میلگرد/اجدار` |
| SKU | `/قیمت/{دسته}/{زیردسته}/{sku-slug}` | `/قیمت/میلگرد/اجدار/میلگرد-14-a3-ذوب-اهن` |
| AI | `/پولادین` | |
| Market | `/طلا-و-ارز` | |
| Tool | `/ابزار/{tool}` | `/ابزار/وزن` |
| Blog/News | `/وبلاگ/{slug}` · `/اخبار/{slug}` | `/وبلاگ/عوامل-موثر-بر-قیمت-میلگرد` |
| Account | `/حساب/{tab}` | `/حساب/درخواست‌ها` |
| Cooperation | `/همکاری/{track}` | `/همکاری/تامین` |
| Search | `/جستجو?q={query}` | `/جستجو?q=میلگرد ۱۴` |

### 3.2 Slug rules
- Persian, lowercase, **hyphen-separated**; ZWNJ and diacritics stripped from slugs (display label keeps full form). Latin tokens (a3, ipe, st37, ۵۰۷) kept as-is.
- Slugs are **stable**; renaming a label does **not** change a live URL without an explicit 301.
- Reserved/transliteration fallback available per node (e.g., `/price/rebar`) → 301 to canonical Persian (optional, off by default).

### 3.3 Canonicalization & redirects
- Each node has **one canonical URL**; filters/sort use query params (`?سایز=14&کارخانه=ذوب-اهن`) and set `rel=canonical` to the base sub-category to avoid duplicate-content.
- Trailing slash normalized; `/قیمت/{cat}/{sub}/` → no trailing slash.
- Legacy/disabled SKUs → 301 to their sub-category (preserve link equity); deleted → 410.
- Admin routes are `noindex`.

---

## 4. Page-Type Inventory
| Type | Purpose | Key components | Indexable |
|---|---|---|---|
| Home | route to lanes | ticker, AI hero, rail, featured prices, trust, blog | ✓ |
| PriceHub | all categories overview | category cards + featured | ✓ |
| Category | sub-category overview + summary table | sub links, mini table, breadcrumb | ✓ |
| SubCategory/Table | the price table | full table (US-B2), filters, toggles, cart | ✓ (primary SEO) |
| SKU | single product + chart | price/نوسان/تحویل, chart, actions, «قیمت پایه», related | ✓ (long-tail SEO) |
| AI | advisor | conversation, chips, tools | ✓ (landing) |
| Market | FX/gold | tgju board, charts, cross-sell | ✓ |
| Tool | calculators | inputs, results, → request | ✓ |
| Cart/RequestFlow | conversion | summary, OTP, پیش‌فاکتور, confirm | noindex |
| Account/Auth | personal | tabs, OTP | noindex |
| Club | loyalty | tiers, benefits, join | ✓ (landing) |
| Blog/News/Guide/Glossary | content/SEO | article, related SKUs | ✓ |
| Why/About/Contact | trust | advantages, logos, address/phones | ✓ |
| CoopHub/Track | B2B leads | intro + form | ✓ |
| Search | findability | results (SKUs+content), facets | noindex |
| Legal/Error | support | text / helpful 404 | 404 noindex |

---

## 5. Navigation Systems

### 5.1 Global primary nav (header, RTL right→left)
`▦لوگو | محصولات ▾ | قیمت‌ها | پولادین(AI) | ابزارها | وبلاگ/اخبار | باشگاه | همکاری | تماس` … utility: `طلا و ارز · 🔍جستجو · ورود/حساب`
- **«محصولات ▾» mega-menu:** 7 columns (categories) each listing its sub-categories + a featured price/CTA; «پولادین» chip to ask the AI.

### 5.2 Fixed category rail (persistent secondary nav) — the signature
- Pinned **right**, on all catalog/home pages; lists the 7 categories; **hover → name flips to image**; click → category/sub table (US-B1). Mobile → bottom-sheet/accordion. Acts as the always-available fast lane.

### 5.3 Footer nav (grouped)
- **محصولات:** 7 categories · **ابزارها:** وزن‌سنج، پروژه‌سنج، محاسبه هزینه · **شرکت:** چرا پولادین، درباره، تماس، همکاری · **پشتیبانی:** قوانین، حریم خصوصی، سؤالات متداول · **کانال‌ها:** تلگرام/ایتا/اینستاگرام/واتساپ · **Trust:** eNamad/Samandehi/اتحادیه + address + phones.

### 5.4 Breadcrumbs (catalog + content)
`خانه › قیمت‌ها › میلگرد › آجدار › میلگرد ۱۴ A3 ذوب‌آهن` (BreadcrumbList schema).

### 5.5 Contextual / cross-linking (SEO + UX)
- SKU → related SKUs (same sub-category, other sizes/factories) + a relevant guide.
- Sub-category → sibling sub-categories + «پرسش از پولادین».
- طلا و ارز → «قیمت آهن امروز» (FX→steel funnel).
- Article ↔ referenced SKUs/categories (two-way links).
- Every empty/error/stale view → «ثبت درخواست»/«پرسش از پولادین» (no dead-ends).

### 5.6 Mobile navigation
- **Top:** hamburger (full menu) + logo + login.
- **Bottom tab bar:** `خانه · قیمت‌ها · 🟠پولادین(center) · سبد · حساب`.
- **Rail** → bottom-sheet; **AI** also a floating button; ticker scrolls at top.

---

## 6. Labeling System (canonical labels — use these everywhere)
| Concept | Canonical Persian label |
|---|---|
| Price table action: request | **ثبت درخواست** |
| Multi-item cart | **سبد استعلام** |
| Pro-forma invoice | **پیش‌فاکتور** |
| Delivery time | **زمان تحویل** |
| Price change | **نوسان** |
| AI advisor | **پولادین** (یا «دستیار پولادین») |
| Price alert | **هشدار قیمت / قیمت‌سنج** |
| Weight calc | **وزن‌سنج** |
| Project estimator | **پروژه‌سنج** |
| Favorites | **علاقه‌مندی‌ها** |
| Loyalty club | **باشگاه پولادین** |
| Cooperation | **همکاری با ما** |
| FX/gold | **طلا و ارز** |
| Market ticker | **نبض بازار** |
- One term per concept (no synonyms drift). Latin terms (A3, IPE, st37) preserved in specs.

---

## 7. Metadata & SEO Schema (per page type)
| Page | `<title>` pattern | schema.org |
|---|---|---|
| Category | «قیمت روز {دسته} — {تاریخ جلالی} | پولادین» | BreadcrumbList + ItemList |
| Sub-category (table) | «قیمت {زیردسته} امروز {تاریخ} | پولادین» | AggregateOffer + BreadcrumbList |
| SKU | «قیمت {محصول} {سایز} {کارخانه} امروز {تاریخ} | پولادین» | **Product + Offer** (price, priceCurrency, priceValidUntil, availability) |
| AI | «پولادین — مشاور هوشمند خرید آهن و فولاد» | WebApplication |
| Market | «قیمت لحظه‌ای دلار، یورو و طلا — پولادین» | — |
| Blog/News | «{عنوان} | وبلاگ پولادین» | **Article** + (FAQPage if Q&A) |
| Tool | «{ابزار} آنلاین — پولادین» | WebApplication |
| Why/About/Contact | «{عنوان} — پولادین» | Organization + LocalBusiness (address/phone) |
- **Global:** unique title+description, canonical, OG/Twitter tags, `lang=fa dir=rtl`, Organization sitewide, sitemap auto-includes new SKUs/articles, robots disallows `/admin`, `/حساب`, `/درخواست`, `/جستجو`.

---

## 8. Search & Findability
- **Three findability paths:** (1) **AI** «پولادین» (natural language), (2) **taxonomy** (rail/mega-menu/breadcrumbs), (3) **site search** `/جستجو`.
- **Site search** indexes SKUs (by محصول/سایز/گرید/کارخانه synonyms) + content; results grouped (قیمت‌ها / مقالات / ابزارها); supports Persian/Arabic/Latin-digit normalization and common misspellings; empty results → AI/request CTA.
- **Filters** (facets §1.3) on every sub-category table; filter state in query params (canonical to base).

---

## 9. Localization / i18n structure
- **Default:** `fa` (RTL), Jalali, Toman — the entire MVP.
- **Future:** `/en` and `/ar` subtrees mirroring the taxonomy (export/diaspora) — **out of MVP**, but the routing layer reserves the locale prefix so it can be added without restructuring.

---

## 10. IA ↔ prior-doc coverage
- **Taxonomy/SKU** ← feature-list B, user-stories Epic B, wireframes 3–5.
- **Sitemap/routes** ← ux-flow F1–F15 (every flow has a home route here).
- **Admin IA** ← user-stories Epic M, wireframes 18–22.
- **Metadata/SEO** ← acceptance-criteria §1.7 (VR-G7).
- **Labels** ← consistent across all docs (single source here).

*Next Layer-2 document: Data Model (entities, fields, relationships) — IA's content model becomes a concrete schema.*

*Poladin — اول مشورت، بعد خرید.*
