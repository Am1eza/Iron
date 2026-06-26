# Ahantime — Responsive Design
## Layer 3 · UI / Design System — Document 7 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `spacing-system.md` (grid/breakpoints), `navigation.md` (responsive matrix), `components.md`, `typography.md`.
**Purpose:** Specify exactly how layouts, navigation, components, and key screens adapt across viewports — mobile-first, RTL, touch-aware — with safe-area handling, performance rules, and a testing matrix.

### Principles
1. **Mobile-first.** Base styles target the smallest screen (~360px); enhance upward with `min-width` queries. Most Iranian traffic is mobile.
2. **Content priority, not just shrinking.** On small screens we re-prioritize (show price + نوسان + زمان تحویل first), not merely scale down.
3. **Touch-first interaction.** Anything that relies on hover (rail flip, tooltips, mega-menu) has a tap/focus equivalent.
4. **RTL holds at every breakpoint** via logical properties.
5. **One layout language.** The grid, density modes, and tokens are the same everywhere; only the arrangement changes.

---

## 1. Breakpoints & base
| Token | Min | Class of device | Grid cols | `--page-x` | Gutter |
|---|---|---|---|---|---|
| (base) | 0 | small phone (~360) | 4 (single-flow) | 16 | 16 |
| `sm` | 480 | large phone | 4 | 16 | 16 |
| `md` | 768 | tablet portrait | 8 | 24 | 20 |
| `lg` | 1024 | tablet land / laptop | 12 | 32 | 24 |
| `xl` | 1280 | desktop | 12 | 32 | 24 |
| `2xl` | 1440 | wide | 12 (wider container) | 40 | 24 |
- **Container:** fluid with `--page-x` padding up to `--container-max` (1280), capped wider at `2xl`. Forms use `--container-narrow` (768); articles `--container-prose` (720).
- **Units:** use **`dvh`/`svh`** (not `vh`) for full-height areas so the mobile browser URL bar doesn't clip content; respect **`env(safe-area-inset-*)`** (§8).

---

## 2. Fluid Type & Spacing
- **Type:** Display/H1/H2/price-hero use `clamp()` (typography §3) — smooth scaling, no jarring jumps; everything rem-based for zoom.
- **Spacing:** section vertical scales by breakpoint (`--section-y`: mobile `space-12` → desktop `space-20/24`); component spacing steps down one notch on mobile (e.g., card padding `space-6`→`space-4`).
- **Density:** Story density relaxes on desktop; Data density stays compact everywhere (tables are dense by nature) but row height grows slightly for touch (mobile rows/cards get ≥44px targets).

---

## 3. Layout Adaptation Patterns (the reflow toolkit)
| Pattern | Desktop | Tablet | Mobile |
|---|---|---|---|
| **Sidebar + content** (rail + page) | fixed rail (inline-end) + content grid | slim icon rail OR top chip bar | rail → chip bar + bottom sheet |
| **Multi-column sections** | 2–4 cols | 2 cols | 1 col (stack) |
| **Data table** | full table | priority columns / scroll-frame | **stacked cards** |
| **Hero (AI)** | central, large, graphite | central | full-width + FAB; conversation full-screen |
| **Mega-menu** | hover panel | click panel | drawer accordion |
| **Modal** | centered dialog | centered | **bottom sheet** |
| **Footer** | columns | 2-col | accordion/stack |

---

## 4. Navigation — responsive behavior (detail)
- **Header:** desktop full bar → **condenses to a sticky compact bar** on scroll (`logo · search/AI · account · ☰`). Mobile = `☰ · logo · login`.
- **Bottom Tab Bar (≤md):** fixed 5-tab (خانه · قیمت‌ها · 🟠آهن‌تایم center · سبد · حساب), respects `safe-area-inset-bottom`; appears only ≤767.
- **Drawer:** hamburger opens from inline-end (right), focus-trapped, full menu accordion.
- **Category Rail:**
  - **lg+:** fixed vertical rail, **hover name→image** flip.
  - **md:** slim **icon strip** (image-only) expanding name on hover, or a sticky top category chip-row on table pages.
  - **≤sm:** **sticky horizontal category chip bar** on catalog/table pages + a «دسته‌بندی» **bottom sheet** from the tab bar. **Touch fallback:** no hover flip — chips show the icon+name and navigate on tap.
- **Breadcrumbs:** full on desktop; **truncate middle** («…») on mobile.
- **Mega-menu → drawer** on ≤md.

---

## 5. The Price Table — responsive strategy (critical)
The Datasheet must stay scannable on a phone.

**Column priority (progressive disclosure):**
1. **استاندارد/نام** (row identity) — always
2. **قیمت** — always (hero)
3. **نوسان** — always (with arrow)
4. **زمان تحویل** — high priority (our differentiator)
5. **وزن** — secondary
6. **تاریخ** — secondary (last-updated shown at table level)

**By breakpoint:**
- **lg+:** full table, all columns, sticky header, sort, density toggle.
- **md:** keep priority 1–4 inline; **وزن/تاریخ** move to a secondary line or a horizontally-scrollable frame (with a frozen first column + a scroll affordance) — never a broken overflow.
- **≤sm:** **transform each row into a card** (Components E1):
  ```
  ┌ میلگرد ۱۴ A3 ذوب‌آهن ───────────┐
  │ قیمت ۳۲٬۴۵۰ ↑۰٫۸٪               │   ← price hero + نوسان
  │ وزن ۱۸٫۹ · تحویل ۲۴ساعت         │
  │ ♡ 📈 ⬇ 🖼   [+سبد] [درخواست]    │   ← actions (≥44px), overflow in popover
  └─────────────────────────────────┘
  ```
  Sticky **inquiry-cart bar** at the bottom (count badge). Filters/VAT/unit toggles move into a **filter bottom-sheet**. Exports (Excel/image/print) remain in the row overflow.

---

## 6. Component Responsive Behavior (summary)
| Component | Adaptation |
|---|---|
| **Ticker** | full ribbon → scrolling marquee on mobile; tap items |
| **AI Hero** | large central (desktop) → prominent block + FAB; **conversation goes full-screen (sheet)** on mobile |
| **AI Chat** | side/inline (desktop) → full-screen overlay on mobile; composer pinned bottom (safe-area) |
| **Inquiry Cart** | panel/page (desktop) → bottom sheet + sticky summary bar (mobile) |
| **پیش‌فاکتور** | document layout → stacked single column; actions full-width on mobile |
| **Chart** | inline (desktop) → tap-to-open sheet on mobile; touch crosshair |
| **Mega-menu** | hover panel → drawer accordion |
| **Modal** | centered dialog → bottom sheet (drag handle) |
| **Tabs** | inline → scrollable tab strip if overflowing |
| **Forms** | 2-col fields (desktop) → single column; inputs ≥16px (no iOS zoom); sticky primary action on long forms |
| **Admin grid** | spreadsheet (desktop) → **per-SKU edit cards/list** on mobile for post-استعلام entry; horizontal scroll-frame on tablet |
| **CRM Kanban** | columns side-by-side → horizontal swipeable columns / single-column with status filter on mobile |
| **Logo wall** | even grid → 3→2 per row on mobile |

---

## 7. Touch vs Pointer
- **Hover features need a tap equivalent:** rail name→image (mobile shows icon+name, taps to navigate), tooltips (tap to reveal / or omit non-essential), mega-menu (tap on touch).
- **No essential info in hover-only** states.
- **Targets ≥44×44px**, spacing ≥8px between targets on touch; increase table action hit areas on mobile.
- **`@media (hover:hover) and (pointer:fine)`** gates hover affordances; coarse-pointer devices get tap behavior.
- **Inputs:** correct `inputmode`/`type` (tel/numeric) for the right mobile keyboard; OTP boxes numeric.

---

## 8. Safe Areas, Viewport & Chrome
- **Safe-area insets:** sticky **bottom tab bar** and chat composer add `padding-bottom: env(safe-area-inset-bottom)`; top ticker/header respect `env(safe-area-inset-top)` where relevant (notch/Dynamic Island).
- **Viewport meta:** `width=device-width, initial-scale=1, viewport-fit=cover`. Never disable user zoom (`user-scalable=no` forbidden — a11y).
- **Full-height:** use `100dvh`/`100svh` for overlays so the address bar collapse doesn't clip; avoid `100vh` pitfalls.
- **Sticky stacking:** ticker (top) + condensed header coexist without covering content (scroll-margin on anchors).

---

## 9. Images & Media
- **Responsive images:** `srcset` + `sizes` for photography; serve WebP/AVIF; **lazy-load below the fold** (`loading="lazy"`); set explicit `width/height`/`aspect-ratio` to prevent CLS.
- **Category icons:** SVG → scale freely, crisp at any size (no raster needed).
- **Logos:** in fixed-ratio frames, mono/duotone; consistent sizing; placeholder if missing.
- **Table-image export** is generated at a fixed share-friendly size regardless of viewport.

---

## 10. Performance (responsive budgets)
- **Mobile-first CSS;** heavy desktop-only pieces (mega-menu panel, multi-col layouts) loaded conditionally.
- **Defer/lazy:** charts, the full chat engine, and admin code are **code-split** and loaded on demand.
- **Budgets (4G mobile, from acceptance-criteria §1.2):** LCP < 2.5s, TTFB < 0.8s (SSR), CLS < 0.1; AI first token < 2s.
- **Fonts:** subset + `font-display: swap` + preload primary (typography §10).
- **Avoid layout thrash:** reserve space for ticker/images; skeletons for tables/chat.

---

## 11. Orientation
- **Phone landscape:** layouts remain usable; bottom bar may convert to a compact side/top nav; chat keeps composer reachable; tables stay card/scroll.
- **Tablet:** portrait = 8-col (often 2-up); landscape = 12-col (desktop-like) — the rail can appear.

---

## 12. RTL across breakpoints
- All reflow uses **logical properties** so mirroring holds at every size.
- Drawer/rail always on inline-end (right); directional icons mirror (iconography §7).
- Persian digits/Jalali/Toman render identically across breakpoints; tabular numerals keep table columns aligned even in the mobile card layout.

---

## 13. Responsive QA — Testing Matrix
**Viewport widths:** 360 · 390/393 · 414 · 480 · 768 · 834 · 1024 · 1280 · 1440 · 1920.
**Conditions per width:**
- [ ] RTL correct; Persian/Jalali/Toman intact; tabular alignment holds.
- [ ] Nav: header condense, bottom bar (≤767, safe-area), drawer, rail transform, mega-menu→drawer.
- [ ] Price table → cards transform; priority columns; sticky cart bar.
- [ ] Modals → bottom sheets; chat full-screen; composer above safe-area.
- [ ] Touch targets ≥44px; hover features have tap equivalents.
- [ ] No CLS from ticker/images; LCP/TTFB within budget on throttled 4G.
- [ ] **Zoom 200%** and **large system font**: no clipping/overlap (rem-based).
- [ ] **Reduced-motion**: marquee/crossfades/skeletons static.
- [ ] Landscape phone usable; iPad portrait/landscape correct.

---

## 14. Do / Don't
- **Do** design mobile-first, re-prioritize content, use `dvh`/safe-area, gate hover with media queries, keep tabular alignment in cards.
- **Don't** hide critical data (price/نوسان/تحویل) on mobile, rely on hover-only, disable zoom, use `100vh`, or let tables overflow into broken horizontal scroll without a frozen column + affordance.

## Bridge
- Applies the foundations/components across all viewports; pairs with the navigation responsive matrix.
- **Next recommended:** Motion/Interaction spec, then **high-fidelity screens** at each breakpoint — and the **live HTML style tile** (responsive) to validate.

*Ahantime — اول مشورت، بعد خرید.*
