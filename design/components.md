# Poladin — Component Library
## Layer 3 · UI / Design System — Document 5 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** the three foundations — `color-system.md`, `typography.md`, `spacing-system.md` — and all Layer-2 docs.
**Purpose:** Specify every UI component precisely so screens can be assembled consistently. Each component lists **anatomy · variants/sizes · states · behavior · a11y · RTL · tokens**. Components use **semantic tokens only**.

### Global component rules
- **Default surface:** white paper, 1px `--color-hairline`, `--radius-md`, **no shadow** (shadow only when floating).
- **One amber action per view** (`--color-action`); cobalt for interactive/intelligent; green/red only in data.
- **Focus:** every interactive element shows a 2px `--color-focus` ring (keyboard).
- **Touch targets ≥44px**; **RTL via logical properties**; **reduced-motion** respected.
- **States every interactive component must define:** default · hover · active/press · focus · disabled · (loading/error where relevant).

---

# A. Action & Form Primitives

## A1 · Button
**Anatomy:** [optional leading icon] + label (+ optional trailing icon). `--t-button`, `--radius-sm`, no letter-spacing.

**Variants**
| Variant | Use | Fill / Text |
|---|---|---|
| **Primary (Action)** | the one key action per view (ثبت درخواست، ذخیره) | `--color-action` fill / `--color-on-action` (ink) text |
| **Secondary (Cobalt)** | important but not the value action | `--cobalt-600` fill / white text |
| **Tertiary / Ghost** | low-emphasis | transparent / `--color-accent-text`, hairline border |
| **Link button** | inline action | text only, `--color-accent-text` |
| **Destructive** | delete/remove (admin) | `--loss-600` fill / white (used rarely) |
| **Icon button** | single glyph | 40–44px box, ghost by default |

**Sizes:** sm (`space-2`×`space-4`, 32–36px) · md (`space-3`×`space-5`, 40–44px, default) · lg (`space-3`×`space-6`, 48px).
**States:** hover → `--color-action-hover`/`cobalt-700`; press → `--color-action-press`; focus → ring; disabled → `--neutral-200` fill + `--neutral-400` text; **loading** → spinner replaces leading icon, label dims, button disabled. **The Spark:** primary press emits a brief amber pulse.
**A11y:** `<button>`; `aria-busy` on loading; `aria-disabled`; min 44px; never icon-only without `aria-label`.
**RTL:** icon sits on the inline-start; padding via `padding-inline`.

## A2 · Text Input / Field
**Anatomy:** label (`--t-label`) · field (`--t-input`, `--radius-xs`, hairline) · optional prefix/suffix (unit «تومان», icon) · helper/error text (`--t-caption`).
**States:** default (hairline) · hover (`--border-strong`) · focus (`--color-focus` ring + `--cobalt-200` glow) · filled · disabled (`--neutral-50` bg) · **error** (`--loss-500` border + error text) · success (subtle gain). Placeholder `--color-text-placeholder`.
**Behavior:** numeric inputs accept Persian/Arabic/Latin digits → normalize; mobile inputs ≥16px (no iOS zoom); `inputmode` set (numeric/tel).
**A11y:** `<label for>`; `aria-invalid` + `aria-describedby` for errors; required marked textually.
**RTL:** text-align start; prefix/suffix on correct inline side (unit on inline-end).

## A3 · Select / Dropdown
Trigger styled like A2 with a trailing chevron (mirrored RTL); opens a `--shadow-sm` listbox (`--radius-md`); options ≥44px; selected shows check + `--cobalt-50`; typeahead; keyboard (↑↓/Enter/Esc); `role="listbox"`.

## A4 · Textarea
Like A2, min 3 rows, vertical resize only; counter optional (`--t-caption`).

## A5 · Checkbox / Radio / Switch
- **Checkbox/Radio:** 20px box, hairline; checked → `--color-accent` fill + white check; focus ring; label `--t-body-sm`.
- **Switch (Toggle):** 44×24 track; off `--neutral-300`, on `--color-accent`; used for **VAT toggle / unit toggle** with adjacent labels «با ارزش‌افزوده»/«کیلویی».
- `role` appropriate; keyboard Space/Enter.

## A6 · OTP Input (code entry)
**Anatomy:** N separate digit boxes (default 5), `--t-price-cell` tabular, `--radius-xs`; auto-advance; paste fills all; resend link with countdown (`--t-caption`).
**States:** empty · focus (active box ring) · filled · **error** (all boxes `--loss-500`, shake-once, reduced-motion: static) · locked (after max attempts → message).
**A11y:** grouped with one accessible label; announces remaining attempts/time; `inputmode="numeric"`.

---

# B. Display Primitives

## B1 · Badge
Small status/label, `--t-overline`, `--radius-pill` or `xs`.
- **نوسان badge:** see F3. **زمان تحویل badge:** see F4. **Stale badge:** «کهنه/تماس بگیرید» (`--loss-50` bg / `--loss-600`). **Status:** new/won/lost (CRM). **Count badge:** on cart/notifications (`--color-action`, circle).

## B2 · Chip / Tag
- **Suggested-question chip (AI):** `--radius-pill`, hairline, `--cobalt-50` hover, `--t-button` sm — cobalt-tinted (intelligence).
- **Filter chip:** selectable, selected → `--color-accent` outline + `--cobalt-50`; removable «×».
- Keyboard focus + Enter/Space; remove via Backspace/«×».

## B3 · Icon
Custom line set, 1.75px stroke, single-color (`currentColor`), sizes 16/20/24. Directional icons mirror in RTL; non-directional don't. No emoji.

## B4 · Avatar / Logo frame
Circle (`--radius-circle`) for users; **Frame** (fixed-ratio, `--radius-sm`) for mill/customer logos shown in mono/duotone; missing → branded placeholder.

## B5 · Tooltip
`--shadow-sm`, `--radius-sm`, `--t-caption`, dark surface; 150ms delay; on hover/focus; `role="tooltip"`; never the only source of essential info.

## B6 · Divider / Hairline
1px `--color-hairline`; optional I-beam motif as a section marker (subtle, centered).

## B7 · Skeleton / Spinner / Progress
- **Skeleton:** neutral-100 blocks with a calm shimmer (reduced-motion: static); used for table rows, cards, chat.
- **Spinner:** 2px cobalt arc; sizes 16/20/24.
- **Linear progress / countdown:** thin bar (`--color-accent` or amber for quote validity countdown).

## B8 · Link
`--color-accent-text`; underline on hover; visited not differentiated; focus ring.

---

# C. Feedback & Overlay

## C1 · Inline Alert / Banner
`--radius-md`, tint bg + matching text + leading icon, per status (success/error/warning/info — color-system §6). Dismissible optional. `role="status"`/`"alert"`.

## C2 · Toast / Snackbar
Bottom-center (mobile) / bottom-inline-start (desktop); `--shadow-md`; auto-dismiss ~4s; one action max; `aria-live="polite"`; stack max 3.

## C3 · Modal / Dialog
**Anatomy:** scrim (`--color-overlay`, `--z-scrim`) · panel (`--color-surface`, `--radius-md`, `--shadow-lg`, `--inset-modal`, max-width `--container-narrow`) · header (title `--t-h3` + close) · body · footer (actions, primary on inline-start). **Focus-trapped**, Esc/scrim closes, focus returns to trigger. `role="dialog" aria-modal`.

## C4 · Bottom Sheet (mobile)
Slides from bottom; drag handle; same semantics as modal; used for filters, rail categories, actions.

## C5 · Popover
Anchored, `--shadow-sm`, `--radius-md`; used for chart preview, row actions overflow, account menu; click-out/Esc closes.

## C6 · Empty State
Centered: subtle I-beam/illustration glyph + `--t-h4` message + `--t-body-sm` hint + **a CTA** («ثبت درخواست»/«پرسش از پولادین»). **No dead-ends.**

## C7 · Club Popup (intent-timed)
A modal/sheet variant; benefits list + tier teaser + «عضو می‌شوم»/«بعداً»; appears after a quote/alert only; dismiss → 7-day suppress.

---

# D. Navigation Components

## D1 · Ticker «نبض بازار»
**Anatomy:** horizontal ribbon (`--z-sticky`), repeating **ticker items**: label + value (`--t-ticker` tabular) + arrow (↑↓) + color (`--color-gain/loss`). Marquee auto-scroll; **pauses on hover/focus**; `prefers-reduced-motion` → static, manual scroll.
**Item states:** live · stale (dim + «با تأخیر») · error (last-known). Each item is a link (FX→`/طلا-و-ارز`, billet→category).
**A11y:** `aria-label="نبض بازار"`; values readable when paused; not the only place critical prices live.

## D2 · Header
**Desktop:** logo (inline-end/right) · primary nav · utility (طلا‌و‌ارز, search, account). **Sticky-condense** on scroll → `--shadow-sm` compact bar (logo · search/AI · account · ☰). Active item: cobalt underline + `aria-current`.
**Mobile:** ☰ · logo · login.

## D3 · Mega-menu «محصولات»
Full-width panel (`--shadow-md`), 7 category columns (links + sub-categories) + a «بپرس از پولادین» column. Hover (150ms intent) or click; arrow-key traversal; focus-trapped while open; Esc closes; current category highlighted. Mobile → drawer accordion.

## D4 · Category Rail (the signature)
**Anatomy:** fixed band `inset-inline-end:0`, `--z-sticky`; vertical list of 7 **rail items** (name + hidden image).
**Interaction:** resting = **name**; hover/focus = **name → image crossfade (200ms)**; active (current category) = **image + `--color-accent` inline-start bar**, persistent; click → category table.
**States:** default · hover/focus (image + cobalt outline) · active (image + cobalt bar) · disabled (muted, no SKUs).
**Responsive:** desktop fixed rail · tablet slim icon strip · mobile = sticky horizontal **category chip bar** + a «دسته‌بندی» bottom sheet.
**A11y:** `<nav aria-label="دسته‌بندی محصولات">`, list semantics, `aria-current` on active, keyboard, ≥44px, reduced-motion → instant swap.
**Tokens:** `--space-3` item padding, `--radius-sm`, image `Frame`.

## D5 · Breadcrumbs
`--t-caption`; `خانه › … › current`; last = non-link `aria-current`; RTL chevrons mirrored; mobile truncates middle to «…»; `BreadcrumbList` schema.

## D6 · Tabs
Underline tabs; active = `--color-accent` underline + strong text; `role="tablist"`, arrow-key nav, panels `role="tabpanel"`. Used in account, cooperation, admin.

## D7 · Bottom Tab Bar (mobile)
Fixed (`--z-sticky`), 5 items: خانه · قیمت‌ها · **🟠 پولادین (center, elevated, amber)** · سبد (count badge) · حساب. Active highlighted + `aria-current`; ≥44px.

## D8 · Drawer (mobile)
Slides from inline-end (right), `--z-drawer` over scrim; accordion menu; focus-trapped; Esc/scrim/swipe closes; returns focus.

## D9 · Pagination
Numbered `‹ ۱ ۲ ۳ ›` (mirrored) or «نمایش بیشتر»/infinite scroll for tables; current `aria-current`; `rel=next/prev`.

## D10 · Footer
Grouped link columns + channels + trust block (eNamad/address/phones, click-to-call); `--color-surface-inverse` (graphite); stacks/accordions on mobile.

---

# E. Data Components — **The Datasheet** (signature)

## E1 · Price Table
**Anatomy:** caption bar (title + **last-updated stamp** + toolbar: filters, search, VAT toggle, unit toggle) · header row (`--t-thead`, muted) · body rows · selection footer (cart). Hairline rules; white paper; `tnum`.
**Columns:** استاندارد · وزن (`--t-data`) · **قیمت** (`--t-price-cell`, `--color-text-strong`) · **نوسان** (E3) · تاریخ (Jalali, `--t-data`) · **زمان تحویل** (E4 badge) · actions (E5).
**Row states:** default · hover (`--neutral-50`) · selected (`--cobalt-50` + inline-start cobalt marker) · **stale** (price → «تماس بگیرید», E via Stale-Price) · focus.
**Density:** comfortable 44px / compact 40px (admin 36px).
**Sorting:** clickable headers (size/price/نوسان) with mirrored arrow; one active sort.
**Mobile:** transforms to **stacked cards** (one SKU per card: name, big قیمت + نوسان, وزن + تحویل, action row) + sticky inquiry-cart bar.
**States:** loading (skeleton rows) · empty («موردی یافت نشد» + CTA) · error (retry).
**A11y:** real `<table>` semantics, `<th scope>`, sortable headers announced; row actions reachable; numbers tabular & column-aligned for scanning.

## E2 · Price Cell (hero number)
`--t-price-cell` (table) / `--t-price-hero` (SKU page) tabular, `--color-text-strong`; unit «تومان» as muted caption; VAT/unit toggles recompute live.

## E3 · نوسان Indicator
`--t-movement` tabular + **arrow** (↑/↓/—) + color (`--color-gain`/`--color-loss`/muted) + «٪». **Always pairs color with arrow/sign** (color-blind safe). Optional tint pill on emphasis.

## E4 · زمان تحویل Badge (our innovation — make it ownable)
Distinct quiet badge: clock/I-beam glyph + value («۲۴ ساعت»), `--radius-sm`, hairline, `--t-caption`; emphasized as a trust signal but not loud. «تحویل تضمینی» variant with a subtle check.

## E5 · Table Row Actions
Icon cluster (≥44px hit areas): ♡ favorite · 📈 chart (opens E7 popover/modal) · ⬇ Excel · 🖼 image-with-logo · 🖨 print · [+ سبد]; primary [ثبت درخواست] as a small action button. Overflow → popover on mobile. Guest favorite → OTP gate.

## E6 · Stat / KPI (admin)
Label (`--t-overline` muted) + value (`--t-h2` tabular) + delta (E3 style). Hairline card.

## E7 · Price Chart
Line chart per color-system §12: cobalt line, 10% area, gain/loss segments, hairline grid, muted axes, amber crosshair; range tabs (روز/هفته/ماه/سال); empty («تاریخچهٔ کافی نیست»); accessible summary/table fallback.

## E8 · Spec / Definition List
SKU specs as term/description rows (`--t-body-sm`/`--t-data`), hairline-separated.

## E9 · Logo Wall
Even grid of `Frame` logos (mill/customer), mono/duotone, consistent sizing, generous gaps.

---

# F. Domain Components

## F1 · AI Hero / Search Bar (central rectangle)
**Anatomy:** greeting line («سلام، من پولادینم…», clearly-AI w/ amber spark mark) · large input (`--t-input`, `--radius-md`, cobalt focus) · submit (cobalt) · suggested-question chips beneath. On graphite `surface-inverse` on home.
**Behavior:** submit → opens F2 conversation (or routes); voice mic (v1.1); always labeled AI.
**States:** idle · focused · submitting (cobalt spinner) · relay-down (graceful note + «ثبت درخواست»).
**A11y:** labeled search/assistant; chips are buttons.

## F2 · AI Chat / Conversation
**Anatomy:** message list (user vs پولادین bubbles, `--radius-md`; AI cobalt-tinted) · **streaming** cursor (calm) · suggested chips · **tool-result cards** (price card, estimate card) · composer (input + mic + send).
**Estimate card:** structured BOM (items + total weight + total cost) labeled «تخمینی» + actions [دریافت پیش‌فاکتور][گفتگو با کارشناس]. Numbers grounded/tabular.
**States:** thinking (skeleton/typing) · grounded answer · **fallback** (missing data → «کارشناس اعلام می‌کند» + creates lead) · error.
**A11y:** `aria-live` for streamed messages; clearly distinguishes AI from human/system.

## F3 · Inquiry Cart «سبد استعلام»
Line items (SKU + qty/weight + edit/remove) · summary (total weight, est. total, VAT toggle) · primary [ثبت درخواست]. Sticky bar on mobile with count badge. Empty state with CTA.

## F4 · پیش‌فاکتور (document/card)
**Anatomy:** branded header (logo/سربرگ) + unique ref# + Jalali date · line table (کالا/مقدار/وزن/قیمت/جمع, tabular) · totals (جمع/ارزش‌افزوده/مبلغ نهایی) · **validity countdown** («معتبر تا فردا ۱۱:۰۰» + linear progress) · actions [⬇ PDF][ارسال پیامک][ادامه در واتساپ]. Print/PDF stylesheet = clean, logo, no UI chrome.

## F5 · Price Alert (form/modal)
Condition (radio زیر/بالای) + value input + channel select + [ذخیره هشدار]; OTP gate if guest; confirmation.

## F6 · Calculator Forms (وزن‌سنج / پروژه‌سنج / هزینه)
Compact input cluster → [محاسبه] → result block (`--t-h3` weight/cost, tabular, labeled تخمینی) → optional [ثبت درخواست]. Inline validation.

## F7 · Lead / Request Form
Name + mobile (OTP) + channel + notes; items pre-filled; clear required states; success → confirmation with status.

## F8 · Cooperation Form
Track tabs (تحلیل بازار/تأمین/فروش) + relevant fields → CRM lead tagged; validated; success/error states.

## F9 · Trust Strip
Row of eNamad/Samandehi/اتحادیه frames + «چرا پولادین» mini-points; quiet, hairline-separated.

## F10 · Card variants
- **Featured-price card:** product + قیمت + نوسان + تحویل + [درخواست].
- **Content/blog card:** image + title (`--t-h4`) + date + excerpt.
- **Benefit card:** line icon + title + short text (Why-us).
All: white surface, hairline, `--radius-md`, no shadow.

## F11 · The Spark (micro-interaction)
A reusable amber pulse/glow (≤300ms) fired on: fresh-price publish, primary-action press, AI wake. Reduced-motion → none. The signature "heat at the point of value."

---

# G. Admin Components

## G1 · Editable Price Grid
Spreadsheet-like: sticky header + frozen first column (کالا); editable cells (قیمت input, زمان تحویل select); **stale rows flagged** (`--loss-50` bg + 🔴); inline validation (price>0) blocks save per row; bulk toolbar (copy-yesterday/±%/Excel import); save → publish + auto نوسان + history + audit; summary footer (counts). Mobile-usable (post-استعلام entry). Keyboard: Tab/Enter to move, paste-fill.

## G2 · CRM Kanban
Columns (جدید/در تماس/برنده/بازنده) with **lead cards** (name, phone, source, items, AI-convo link, actions); drag or status-select; filters; all changes audit-logged.

## G3 · Admin Sidebar Nav
Fixed inline-end (right) collapsible; sections per IA; **role-based visibility** (hidden, not just disabled); active section marked; top bar (user/role chip, env, search, logout).

## G4 · Approval Queue Item
Draft row (title/date/«پیش‌نویس») + actions [ویرایش][تأیید و انتشار][زمان‌بندی][رد]; flagged unverifiable price-claims highlighted (warning tint).

## G5 · Audit Log Row
Actor · action · entity · before→after · timestamp; filterable; read-only.

---

# H. Global States & Patterns
- **Every interactive component:** default/hover/press/focus/disabled (+ loading/error where relevant) — no exceptions.
- **Every data region:** loading (skeleton) · empty (CTA) · error (retry) · stale (visible date) — never blank, **no dead-ends**.
- **Reduced motion:** the Spark, crossfades, skeleton shimmer, streaming, drawer transitions all degrade to instant/static.
- **RTL:** all components use logical properties; directional icons mirror; drawers/rail on inline-end.
- **Reuse:** built from foundation tokens only; no off-scale or hardcoded values.

---

## Component Inventory (coverage)
A: Button · Input · Select · Textarea · Checkbox/Radio/Switch · OTP — 6
B: Badge · Chip/Tag · Icon · Avatar/Frame · Tooltip · Divider · Skeleton/Spinner/Progress · Link — 8
C: Alert · Toast · Modal · Bottom-sheet · Popover · Empty-state · Club-popup — 7
D: Ticker · Header · Mega-menu · **Rail** · Breadcrumbs · Tabs · Bottom-bar · Drawer · Pagination · Footer — 10
E: **Price Table** · Price cell · نوسان · زمان تحویل badge · Row actions · Stat · Chart · Spec list · Logo wall — 9
F: AI Hero · AI Chat/estimate card · Inquiry cart · پیش‌فاکتور · Alert form · Calculators · Lead form · Cooperation form · Trust strip · Cards · The Spark — 11
G: Price grid · CRM kanban · Admin sidebar · Approval item · Audit row — 5
**Total: ~56 components.**

## Bridge
- Realizes the Design Language signatures (Datasheet, Rail flip, the Spark, graphite-paper, cobalt=smart) using the foundation tokens.
- **Next:** Iconography & Illustration · Motion/Interaction spec · then high-fidelity screen designs (applying components to every Layer-2 wireframe). And the recommended **live HTML style tile** to validate the look.

*Poladin — اول مشورت، بعد خرید.*
