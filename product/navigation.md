# Fooladno — Navigation Specification
## Layer 2 · Product Design — Document 10 of N (final)

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `information-architecture.md` (this is the detailed navigation layer of the IA).
**Purpose:** Specify every navigation component precisely — structure, behavior, states, active/wayfinding logic, accessibility, RTL rules, responsive transforms, and admin nav — so the UI/Design System (Layer 3) can be built without ambiguity.

### Navigation principles
1. **Two doors, always open:** the **AI** (conversational nav) and the **taxonomy** (rail/menu) are reachable from every page.
2. **You always know where you are:** active states + breadcrumbs + rail highlight = persistent wayfinding.
3. **Three taps to any price** from anywhere (rail → category → table).
4. **No dead-ends:** every terminal/empty/error state offers an onward nav (request, AI, popular categories).
5. **RTL-native & accessible:** right-to-left flow, landmarks, full keyboard support.

---

## 1. Navigation Systems Inventory
| # | System | Scope | Primary persona | Where |
|---|---|---|---|---|
| N1 | **نبض بازار ticker** (clickable) | global | Price-Checker | top, every page |
| N2 | **Global header / primary nav** | global | all | top |
| N3 | **«محصولات» mega-menu** | global | Pro, Builder | header dropdown |
| N4 | **Fixed category rail** (signature) | home+catalog | Pro, Trader | right, fixed |
| N5 | **Utility nav** (login/طلا‌و‌ارز/search) | global | all | header end |
| N6 | **Footer nav** | global | all | bottom |
| N7 | **Breadcrumbs** | catalog+content | all | below header |
| N8 | **Local/tab nav** (account, cooperation, admin) | section | all | in-page |
| N9 | **Filter/facet nav** | sub-category tables | Pro, Trader | table toolbar |
| N10 | **Contextual/related nav** | SKU, article, empty states | all | in content |
| N11 | **Pagination** | lists | all | list footers |
| N12 | **Mobile bottom tab bar** | global (mobile) | all | bottom (mobile) |
| N13 | **Mobile drawer (hamburger)** | global (mobile) | all | right drawer |
| N14 | **AI as navigation** | global | Builder | hero/FAB |
| N15 | **Search as navigation** | global | all | header/`/جستجو` |

---

## 2. N1 · نبض بازار Ticker (navigational)
- Slim moving ribbon, top of every page. Items: دلار · یورو · طلا · انس · شمش.
- **Click target:** each item → `/طلا-و-ارز` (FX items) or the relevant market/SKU; **billet → category cross-link**.
- **Behavior:** auto-scroll marquee; pauses on hover/focus (a11y); respects `prefers-reduced-motion` (static, manual scroll).
- **States:** live · stale (subtle «با تأخیر» + dimmed) · error (last-known values, never blank).

---

## 3. N2 · Global Header / Primary Nav

### Structure (RTL — right→left visual order)
`▦لوگو` → `محصولات ▾` → `قیمت‌ها` → `فولادنو` → `ابزارها ▾` → `وبلاگ/اخبار` → `باشگاه` → `همکاری` → `تماس` … then utility (§6): `طلا و ارز` · `🔍` · `ورود/حساب`.

### Behavior
- **Sticky:** on scroll-down past the ticker, the header **condenses** into a sticky bar: `▦لوگو · 🔍/فولادنو · حساب · ☰(secondary)`. On scroll-up, full header returns. Ticker scrolls away with the page (re-appears at top).
- **Active top-level:** the section matching the current route is marked (Cobalt underline + `aria-current="page"`).
- **«فولادنو»** entry opens the AI (hero focus on home, full AI view elsewhere).
- **«ابزارها ▾»** small dropdown: وزن‌سنج · پروژه‌سنج · محاسبه هزینه · طلا و ارز.

### States (every nav item)
| State | Treatment |
|---|---|
| default | Slate text |
| hover | Cobalt text + subtle underline |
| focus (keyboard) | visible Cobalt focus ring |
| active/current | Cobalt + persistent underline, `aria-current` |
| disabled | muted, non-interactive |

---

## 4. N3 · «محصولات» Mega-Menu
- **Trigger:** hover (desktop, with 150ms intent delay) **or** click/Enter; closes on mouse-leave, `Esc`, or outside-click.
- **Layout:** full-width panel, **7 category columns**; each column = category title (link) + its sub-categories (links) + a small «قیمت روز» CTA. A trailing **«بپرس از فولادنو»** column with the AI chip + a featured price.
- **Active marking:** the column for the current category is highlighted.
- **A11y:** `role=menu`, arrow-key traversal within/between columns, focus trapped while open, focus returns to the trigger on close.
- **Mobile:** not a hover panel — collapses into the drawer (§13) as an accordion.

---

## 5. N4 · Fixed Category Rail (the signature) — precise spec
> The product's defining navigation element.

### Position & persistence
- **Fixed to the right edge** (RTL "start" side), vertically centered band; **sticky** within the viewport as the page scrolls; present on Home + all `/قیمت/*` pages.
- Lists the **7 categories** in taxonomy order.

### Interaction
- **Resting:** shows the **category name** (text).
- **Hover/focus:** the name **morphs into the category image** (icon/photo) with a 200ms crossfade (US-B1); reverse on leave.
- **Active/current:** when viewing a category, its rail item shows the **image + a Cobalt active marker** persistently (so the user always sees where they are).
- **Click/Enter:** navigates to that category's table (`/قیمت/{دسته}`).
- **`prefers-reduced-motion`:** crossfade replaced by instant swap.

### States
| State | Name shown | Image shown | Marker |
|---|---|---|---|
| default | ✓ | — | — |
| hover/focus | — | ✓ | Cobalt outline |
| active (current category) | — | ✓ | Cobalt bar |
| disabled (empty cat) | muted name | — | — |

### Responsive transform
- **Desktop (≥1024):** fixed right rail as above.
- **Tablet (768–1023):** rail collapses to a slim icon strip (image-only) that expands name on hover; or a top sticky category chip-row on table pages.
- **Mobile (≤767):** becomes (a) a **sticky horizontal category chip bar** on catalog/table pages, and (b) a **«دسته‌بندی» bottom-sheet** from the bottom tab — both list the 7 categories → sub-categories. Hover→image is replaced by tap→navigate.

### A11y
- `<nav aria-label="دسته‌بندی محصولات">`, list semantics, keyboard reachable, `aria-current` on active, ≥44px targets.

---

## 6. N5 · Utility Nav
- **طلا و ارز** → `/طلا-و-ارز`.
- **🔍 Search** → opens an inline search field / `/جستجو` (autosuggest across SKUs + content).
- **ورود/حساب** → guest: «ورود» (OTP); logged-in: avatar/name → menu (حساب، علاقه‌مندی‌ها، درخواست‌ها، هشدارها، باشگاه، خروج).
- **(Future) language switcher** `fa/en/ar` — reserved, hidden in MVP.

---

## 7. N6 · Footer Nav (grouped columns, RTL)
1. **محصولات:** 7 categories.
2. **ابزارها:** وزن‌سنج · پروژه‌سنج · محاسبه هزینه · طلا و ارز.
3. **شرکت:** چرا فولادنو · درباره ما · تماس · همکاری با ما.
4. **پشتیبانی:** سؤالات متداول · قوانین · حریم خصوصی.
5. **کانال‌ها:** تلگرام · ایتا · اینستاگرام · واتساپ.
6. **Trust block:** eNamad/Samandehi/اتحادیه + address + phones (click-to-call).
- `<nav aria-label="ناوبری پاورقی">`; columns stack on mobile (accordion optional).

---

## 8. N7 · Breadcrumbs
- **Where:** Category, Sub-category, SKU, and content pages (not Home/Account/flows).
- **Format:** `خانه › قیمت‌ها › میلگرد › آجدار › میلگرد ۱۴ A3 ذوب‌آهن` — last item = current page, **not a link**, `aria-current="page"`.
- **RTL separators:** the chevron points **left** («›» rendered appropriately for RTL).
- **Mobile truncation:** collapse middle to `… ›` with the last 1–2 levels visible; tap «…» expands.
- **Schema:** `BreadcrumbList`.

---

## 9. N8 · Local / Tab Navigation
- **Account:** tabs علاقه‌مندی‌ها · درخواست‌ها · هشدارها · پروفایل · باشگاه (`/حساب/{tab}`); active tab marked; deep-linkable.
- **Cooperation:** tabs تحلیل بازار · تأمین از شما · فروش از ما.
- **Sub-category switcher:** within a category, a chip/tab row to switch sub-categories without leaving the table context.
- **Admin:** sidebar (§14).

## 10. N9 · Filter / Facet Nav
- On every sub-category table: سایز · گرید · کارخانه · ضخامت (+ search). Selections update the table and the URL query (`?سایز=14&کارخانه=ذوب-اهن`), `rel=canonical` to base. «حذف فیلترها» resets. Empty result → AI/request CTA (no dead-end).

## 11. N10 · Contextual / Related Nav
- **SKU:** related SKUs (same sub-category, other sizes/factories) + «مقالهٔ مرتبط» + «پرسش از فولادنو».
- **Article:** referenced SKUs/categories (two-way).
- **طلا و ارز → «قیمت آهن امروز»** (funnel).
- **Empty/error/stale/404:** popular categories + search + AI + home (no dead-ends).

## 12. N11 · Pagination
- Lists (blog/news/search/long tables): numbered pager `‹ ۱ ۲ ۳ ›` (RTL arrows mirrored) or «نمایش بیشتر»/infinite-scroll for tables; `rel=next/prev`; current page `aria-current`.

---

## 13. Mobile Navigation (N12 bottom bar + N13 drawer)

### N12 · Bottom Tab Bar (sticky, ≤767px)
`خانه` · `قیمت‌ها` · **`🟠 فولادنو`** (center, elevated, amber spark) · `سبد استعلام` · `حساب`
- 5 targets, ≥44px; center AI visually emphasized; active tab highlighted (Cobalt) with `aria-current`; badge on سبد when items exist.

### N13 · Hamburger Drawer (opens from the RIGHT, RTL)
- Mirrors header + footer: محصولات (accordion → categories → sub-categories) · قیمت‌ها · فولادنو · ابزارها · وبلاگ/اخبار · باشگاه · همکاری · درباره/تماس · (طلا و ارز) · ورود/حساب · channels.
- `role="dialog"`, **focus-trapped**, `Esc`/overlay closes, focus returns to the toggle; swipe-to-close.

---

## 14. N14 · AI as Navigation
- The AI «فولادنو» is a **first-class navigation method**: a natural-language query routes the user to a price/table/tool/quote. It can deep-link («صفحهٔ میلگرد ۱۴ ذوب‌آهن را باز کن») and always offers structured next steps (chips). Present as the hero (home) and a FAB (everywhere on mobile).

## 15. N15 · Search as Navigation
- Header search + `/جستجو`: autosuggest grouped (قیمت‌ها / مقالات / ابزارها); Enter → results page; selecting a suggestion deep-links to the node; digit/spelling normalization; empty → AI/request CTA.

---

## 16. Active-State & Wayfinding Logic (single source)
At any location, the system marks "you are here" consistently:
- **Rail:** current category shows image + Cobalt marker.
- **Header/mega-menu:** current top-level + category highlighted.
- **Breadcrumb:** full path, current = non-link `aria-current`.
- **Bottom tab / account tab:** current tab highlighted.
- **Page `<title>` + H1** reflect the node (also SEO).
> Rule: **every navigable node sets exactly one "current" indicator in each visible nav system.**

---

## 17. Behavior Rules
- **Sticky:** ticker scrolls away; header condenses + sticks; rail sticky; bottom bar fixed.
- **Back / scroll restoration:** browser back restores scroll position and table filter state; deep links open the exact filtered view.
- **Deep-linking:** all nav destinations are URL-addressable (filters in query params; AI deep-links resolve to routes).
- **Intent delays:** mega-menu/rail hover use a 150–200ms open delay + close grace to prevent flicker.
- **Reduced motion:** marquee, crossfades, and drawer transitions degrade to instant/static.

---

## 18. Accessibility (navigation)
- **Landmarks:** `header`, `nav[aria-label="ناوبری اصلی"]`, `nav[aria-label="دسته‌بندی محصولات"]`, `nav[aria-label="مسیر صفحه"]` (breadcrumb), `nav[aria-label="ناوبری پاورقی"]`, `main`, `footer`.
- **Skip link:** «پرش به محتوا» as first focusable element.
- **Keyboard:** full operability; arrow-keys in menus/rail; `Esc` closes overlays; **focus trap** in drawer/mega-menu; focus returns to trigger on close; visible focus ring (Cobalt) everywhere.
- **`aria-current="page"`** on the active item in each system.
- **Targets ≥44×44px**; sufficient contrast (AA) per brand.
- Screen-reader: menus announced as menus; current state announced.

---

## 19. RTL Specifics
- Document `dir="rtl"`; nav flows right→left; **logo at the right**, utility at the left.
- **Drawer opens from the right;** mega-menu aligns right.
- **Directional icons mirror** (chevrons, breadcrumb separators, pagination arrows, "back"); **non-directional icons do not** (search, user, cart).
- Persian digits in any nav counters/badges.

---

## 20. Responsive Navigation Matrix
| Component | Desktop ≥1024 | Tablet 768–1023 | Mobile ≤767 |
|---|---|---|---|
| Ticker (N1) | full ribbon | full ribbon | scrolling ribbon |
| Header primary (N2) | full bar | full/condensed | logo + search/AI + ☰ |
| Mega-menu (N3) | hover panel | click panel | → drawer accordion |
| Category rail (N4) | fixed right rail | slim icon strip | chip bar + bottom-sheet |
| Utility (N5) | inline | inline/condensed | inside drawer/top |
| Footer (N6) | columns | columns | stacked/accordion |
| Breadcrumb (N7) | full | full | truncated |
| Bottom tab bar (N12) | — | — | sticky 5-tab |
| Drawer (N13) | — | optional | hamburger |
| AI (N14) | hero | hero | FAB + center tab |

---

## 21. Admin Navigation
- **Sidebar (fixed right, RTL), collapsible**, sections: داشبورد · **قیمت‌گذاری روزانه** · کاتالوگ · تیکر و بازار · درخواست‌ها (CRM) · محتوا · باشگاه · رسانه/برند · کاربران و نقش‌ها · تنظیمات · گزارش‌ها · لاگ ممیزی.
- **Role-based visibility:** OP sees قیمت‌گذاری/تیکر/کاتالوگ(read); SA sees درخواست‌ها; CE sees محتوا; CM sees کاتالوگ; ADM sees all. Hidden (not just disabled) for unauthorized roles; direct access → 403.
- **Top bar:** user + role chip · environment indicator · quick-search · notifications · logout.
- **Breadcrumb** inside admin for deep pages; active section marked; `noindex` on all admin routes.

---

## 22. Navigation Analytics (events to track)
`nav_megamenu_open`, `rail_category_click {category}`, `rail_hover_image`, `header_nav_click {item}`, `bottombar_tab {tab}`, `ai_entry {source}`, `search_use {query,result}`, `breadcrumb_click {level}`, `footer_link_click`, `ticker_item_click {item}`. Feeds the funnel dashboard (which lane users prefer, rail vs AI vs search).

---

## 23. Edge cases
- **404:** branded page with search + popular categories + AI + home (never a bare error).
- **Deep link to filtered table:** opens with filters applied, canonical preserved.
- **Disabled category (no SKUs):** muted in rail/menu with a tooltip; not clickable.
- **Logged-out hitting `/حساب`:** redirect to `/ورود` then back.

---

## 24. Coverage
- Realizes IA §5 (navigation overview) in full detail.
- Serves the dual-mode model (User Prioritization) — guided (N14/N15) vs structured (N3/N4/N7).
- Wires every UX flow's transitions (ux-flow F1–F15) to concrete nav components.

---

**✅ Layer 2 — Product Design is complete:** Product Scope · MVP · Feature List · User Prioritization · User Stories · Acceptance Criteria · UX Flow · Wireframes · Information Architecture · **Navigation**.

**→ Next: Layer 3 — UI / Design System** (design tokens from the brand book, component library, the high-fidelity look of every nav/screen specified here).

*Fooladno — اول مشورت، بعد خرید.*
