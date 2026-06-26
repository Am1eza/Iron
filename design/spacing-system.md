# Poladin — Spacing & Layout System
## Layer 3 · UI / Design System — Document 4 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `design/design-language.md`, `design/typography.md`, `design/color-system.md`.
**Purpose:** The complete spatial system — base grid, spacing scale, radius/border/shadow/z-index scales, the layout grid (columns, containers, breakpoints), density modes, component insets, touch targets, RTL rules, and CSS tokens. This is the structure behind the "blueprint discipline" of the Design Language.

### Principles
1. **One base unit — 4px.** Every space, size, and radius is a multiple of 4 → visual rhythm and pixel-snapped crispness.
2. **Space is structure.** Layout is built from consistent spacing and an exposed grid, not decoration (Design Language P1).
3. **Two densities.** *Story* (airy marketing/AI) vs *Data* (compact tables/admin) — a deliberate, recognizable rhythm.
4. **RTL by logical properties.** Use `inline-start/end` everywhere; spacing mirrors automatically.
5. **Restraint & consistency.** Only scale values are allowed — no arbitrary one-off margins.

---

## 1. Base Grid & Scale
**Base = 4px (0.25rem).** Token number × 4 = pixel value (`space-6` = 24px). All spacing comes from this scale.

| Token | px | rem | Typical use |
|---|---|---|---|
| `--space-0` | 0 | 0 | reset |
| `--space-1` | 4 | .25 | hairline gaps, icon↔text, tight chip padding |
| `--space-2` | 8 | .5 | compact gaps, table row vertical, chip padding |
| `--space-3` | 12 | .75 | input padding (v), small gaps |
| `--space-4` | 16 | 1 | **default gap**, mobile gutter, card inner gap |
| `--space-5` | 20 | 1.25 | tablet gutter, button block padding |
| `--space-6` | 24 | 1.5 | **card padding**, desktop gutter, group gap |
| `--space-8` | 32 | 2 | block spacing, modal padding |
| `--space-10` | 40 | 2.5 | small section gap |
| `--space-12` | 48 | 3 | section gap (compact) |
| `--space-16` | 64 | 4 | **section vertical padding** (data pages) |
| `--space-20` | 80 | 5 | section vertical padding (story pages) |
| `--space-24` | 96 | 6 | hero / large section padding |
| `--space-32` | 128 | 8 | major page breaks (rare) |

> Only these values may be used. If a value isn't on the scale, the design is wrong, not the scale.

### 1.1 Semantic spacing aliases (optional, for clarity)
| Alias | → | Meaning |
|---|---|---|
| `--gap-inline` | `space-2` | between inline items (icon/text) |
| `--gap-component` | `space-4` | between fields/controls |
| `--gap-group` | `space-6` | between component groups |
| `--inset-card` | `space-6` | card/panel padding |
| `--inset-modal` | `space-8` | modal padding |
| `--section-y` | `space-16`/`space-20` | section vertical (data/story) |
| `--page-x` | responsive | page side padding (§4) |

---

## 2. Radius Scale (small, honest edges — no blobs)
Per Design Language: steel sections have crisp edges; default is restrained.
| Token | px | Use |
|---|---|---|
| `--radius-0` | 0 | flush table cells, full-bleed |
| `--radius-xs` | 4 | inputs, small controls, badges |
| `--radius-sm` | 6 | **buttons**, chips body, table action btns |
| `--radius-md` | 8 | **cards, panels, modals, popovers** |
| `--radius-lg` | 12 | large feature panels (sparingly) |
| `--radius-pill` | 999 | **chips/tags/toggles only** (suggested-question chips) |
| `--radius-circle` | 50% | avatars, icon-only round buttons |
> **Rule:** default surfaces use `md (8px)`; never apply `lg`/`pill` to everything. Over-rounding reads as a template (banned in DL §3).

---

## 3. Border & Hairline Widths
| Token | px | Use |
|---|---|---|
| `--border-hairline` | 1 | **default** — dividers, table rules, input borders (the drafting line) |
| `--border-strong` | 1.5 | emphasized separators, active table left-marker |
| `--border-focus` | 2 | focus ring (with 2px offset), selected states |
> Default everything to **1px hairline**; thickness is meaningful, not decorative.

---

## 4. Layout Grid, Containers & Breakpoints

### 4.1 Breakpoints
| Token | Min width | Mode |
|---|---|---|
| `--bp-sm` | 480px | large phone |
| `--bp-md` | 768px | tablet |
| `--bp-lg` | 1024px | desktop |
| `--bp-xl` | 1280px | wide desktop |
| `--bp-2xl` | 1440px | extra-wide |
*(Consistent with the navigation responsive matrix: mobile ≤767, tablet 768–1023, desktop ≥1024.)*

### 4.2 The grid
- **12 columns** on desktop; **6** on tablet; **4** (often single-flow) on mobile.
- **Gutters:** desktop `space-6` (24) · tablet `space-5` (20) · mobile `space-4` (16).
- **Page side padding (`--page-x`):** mobile `space-4` (16) · tablet `space-6` (24) · desktop `space-8` (32).
- Layout is **content-centered within a max-width** with side padding; the **fixed category rail** occupies a reserved right band (≈88–96px collapsed / wider on hover) outside the content max-width on desktop, so content columns are unaffected.

### 4.3 Container widths
| Token | Max | Use |
|---|---|---|
| `--container-wide` | 1440px | dashboards / full data |
| `--container-max` | 1280px | **default site container** |
| `--container-narrow` | 768px | forms, focused flows (request/پیش‌فاکتور) |
| `--container-prose` | 720px | article reading measure (ties to type measure) |
- Containers are centered with `--page-x` side padding; never edge-to-edge text.

---

## 5. Density Modes (the rhythm)
A deliberate contrast between airy "story" and compact "data."

| Aspect | **Story density** (home, AI, marketing, trust) | **Data density** (tables, SKU, admin, forms) |
|---|---|---|
| Section vertical | `space-20`/`space-24` | `space-12`/`space-16` |
| Component gap | `space-6` | `space-3`/`space-4` |
| Card padding | `space-6`/`space-8` | `space-4` |
| Table row height | — | **44px comfortable / 40px compact** (admin can go 36px) |
| Table cell padding | — | `space-3` v / `space-4` h (comfortable); `space-2`/`space-3` (compact) |
| Type | larger (`body-lg`, big headings) | `body`/`data`, tabular |
- The user *feels* the shift from "being advised" (spacious) to "scanning data" (dense) — part of the dual-mode aesthetic.

---

## 6. Component Inset Patterns (defaults)
| Component | Padding (v × h) | Radius | Gap |
|---|---|---|---|
| Button (md) | `space-3` × `space-5` (12×20) | `sm` (6) | icon↔text `space-2` |
| Button (sm) | `space-2` × `space-4` (8×16) | `sm` | `space-1` |
| Input / Select | `space-3` × `space-4` (12×16) | `xs` (4) | — |
| Chip / Tag | `space-1` × `space-3` (4×12) | `pill` | `space-1` |
| Card / Panel | `space-6` (24) | `md` (8) | content `space-4` |
| Modal | `space-8` (32) | `md` | sections `space-6` |
| Table cell | `space-3` × `space-4` | `0` | — |
| Ticker item | `space-2` × `space-4` | `0` | items `space-6` |
| AI message bubble | `space-3` × `space-4` | `md` | stack `space-3` |
| List row | `space-3` × `space-4` | `0` | — |
| Section | `--section-y` × `--page-x` | — | blocks `space-8`+ |

---

## 7. Elevation / Shadow Scale (rare, calm)
Flat by default (DL P6); only truly-floating layers get one soft shadow. **No glassmorphism.**
| Token | Value (light) | Use |
|---|---|---|
| `--shadow-none` | none | **default** — cards/rows/tables |
| `--shadow-sm` | `0 2px 8px rgba(16,22,30,.08)` | dropdowns, popovers, sticky-condensed header |
| `--shadow-md` | `0 8px 24px rgba(16,22,30,.12)` | menus, drawers, the AI FAB |
| `--shadow-lg` | `0 16px 48px rgba(16,22,30,.16)` | modals only |
*(Dark mode: replace with `rgba(0,0,0,.4/.5/.6)`.)*

---

## 8. Z-Index Scale (layering)
| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | content |
| `--z-raised` | 10 | sticky inquiry-cart bar, raised cards |
| `--z-sticky` | 100 | sticky header, fixed category rail, bottom tab bar |
| `--z-fab` | 150 | AI floating button |
| `--z-dropdown` | 200 | menus, autosuggest, popovers |
| `--z-scrim` | 300 | modal/drawer overlay |
| `--z-drawer` | 350 | mobile drawer |
| `--z-modal` | 400 | dialogs, پیش‌فاکتور, club popup |
| `--z-toast` | 500 | toasts/snackbars |
| `--z-tooltip` | 600 | tooltips |
> Only these tokens — never ad-hoc large z-index numbers.

---

## 9. Touch Targets & Hit Areas
- **Minimum 44×44px** for any tappable control (buttons, rail items, tabs, table actions, ticker items).
- Icon-only buttons: 40–44px box even if the glyph is 20–24px.
- **≥8px (`space-2`) spacing** between adjacent targets to prevent mis-taps.
- Table action icons get padded hit areas on mobile (the row's «درخواست» remains the primary large target).

---

## 10. RTL Spacing (logical properties — mandatory)
- Use **logical properties** exclusively for flow spacing/positioning: `margin-inline-start/-end`, `padding-inline`, `inset-inline-start/-end`, `border-inline-*`, `text-align: start/end`.
- **Never** hardcode `left/right` for layout flow — that breaks RTL. (Physical `top/bottom` are fine.)
- The fixed rail uses `inset-inline-end: 0` (right in RTL); the drawer slides from `inline-end`.
- Gaps via `gap` (direction-agnostic) on flex/grid wherever possible.

---

## 11. Vertical Rhythm & Alignment
- All spacing = multiples of 4px; type line-heights chosen to sit on the **4px baseline** (typography §7) → text and boxes align.
- Stack components with consistent `gap`; avoid mixing margins and paddings for the same rhythm.
- Section starts align to the grid; the "blueprint" feel comes from everything snapping to 4px.

---

## 12. Layout Primitives (apply spacing consistently)
Recommended composable primitives (build once, reuse):
- **Stack** — vertical flow with a single `gap` token.
- **Cluster** — horizontal group, wraps, `gap`.
- **Grid** — the 12-col responsive grid.
- **Sidebar** — content + fixed rail composition.
- **Center/Container** — max-width + `--page-x`.
- **Frame** — fixed-ratio media (category images, logos).
> Using primitives guarantees only scale values appear — no rogue spacing.

---

## 13. Do / Don't
- **Do** use only scale tokens; default cards to `radius-md` + hairline + no shadow; use logical properties.
- **Do** switch densities deliberately (story vs data).
- **Don't** invent off-scale spacing, over-round (pill/lg everywhere), shadow every card, or use `left/right` for flow.
- **Don't** crowd content edge-to-edge; respect `--page-x` and container max-widths.

---

## 14. CSS Tokens (ready to use)
```css
:root{
  /* spacing (×4px) */
  --space-0:0; --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.25rem; --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem; --space-12:3rem;
  --space-16:4rem; --space-20:5rem; --space-24:6rem; --space-32:8rem;
  /* semantic */
  --gap-inline:var(--space-2); --gap-component:var(--space-4); --gap-group:var(--space-6);
  --inset-card:var(--space-6); --inset-modal:var(--space-8);
  /* radius */
  --radius-0:0; --radius-xs:4px; --radius-sm:6px; --radius-md:8px; --radius-lg:12px;
  --radius-pill:999px; --radius-circle:50%;
  /* borders */
  --border-hairline:1px; --border-strong:1.5px; --border-focus:2px;
  /* shadows */
  --shadow-none:none;
  --shadow-sm:0 2px 8px rgba(16,22,30,.08);
  --shadow-md:0 8px 24px rgba(16,22,30,.12);
  --shadow-lg:0 16px 48px rgba(16,22,30,.16);
  /* z-index */
  --z-base:0; --z-raised:10; --z-sticky:100; --z-fab:150; --z-dropdown:200;
  --z-scrim:300; --z-drawer:350; --z-modal:400; --z-toast:500; --z-tooltip:600;
  /* layout */
  --container-wide:1440px; --container-max:1280px; --container-narrow:768px; --container-prose:720px;
  --page-x:1rem; /* mobile */
}
@media (min-width:768px){ :root{ --page-x:1.5rem; } }   /* tablet */
@media (min-width:1024px){ :root{ --page-x:2rem; } }     /* desktop */
:root[data-theme="dark"]{
  --shadow-sm:0 2px 8px rgba(0,0,0,.4);
  --shadow-md:0 8px 24px rgba(0,0,0,.5);
  --shadow-lg:0 16px 48px rgba(0,0,0,.6);
}
.container{max-inline-size:var(--container-max);margin-inline:auto;padding-inline:var(--page-x);}
.stack{display:flex;flex-direction:column;gap:var(--gap-component);}
.cluster{display:flex;flex-wrap:wrap;gap:var(--gap-inline);align-items:center;}
.card{padding:var(--inset-card);border:var(--border-hairline) solid var(--color-hairline);
  border-radius:var(--radius-md);background:var(--color-surface);box-shadow:var(--shadow-none);}
```

---

## 15. Bridge
- Completes the **three foundation pillars**: Color · Typography · **Spacing/Layout**.
- Provides the grid, scale, radius, shadow, and z-index that the **Component Library** (next) will assemble into buttons, the Datasheet table, ticker, AI hero, rail, inputs, modals, and the admin grid.

*Poladin — اول مشورت، بعد خرید.*
