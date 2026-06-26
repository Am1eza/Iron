# Ahantime — Color System
## Layer 3 · UI / Design System — Document 2 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `brand/brand-book.md`, `design/design-language.md`.
**Purpose:** The exact, complete color system — primitive scales, semantic tokens (light + dark), data/status/state colors, accessibility, chart palette, usage rules, and ready-to-implement CSS variables. Realizes the **Engineered Calm** triad: **Graphite (body) · Cobalt (mind) · Amber (spark)**.

### Governing rules (from the Design Language)
1. **Mono-accent per view:** one **Amber** moment (the single action/value) + **Cobalt** for interactive/intelligent. Restraint = premium.
2. **Data color is sacred:** **green/red appear ONLY in نوسان/ticker/charts** — never as UI decoration. (Matches tgju: green = up, red = down.)
3. **70 / 20 / 10:** ~70% neutral & space · ~20% graphite ink · ~10% accent.
4. **No gradients, no glassmorphism** (banned). Flat, matte, hairline-defined.
5. **Categories are NOT color-coded** — they use icons + ink, never a rainbow.

---

## 1. Color Model
Two tiers:
- **Primitives** — raw tonal scales (`--neutral-500`, `--cobalt-500`…). Never used directly in components.
- **Semantic tokens** — role-based aliases (`--color-text`, `--color-action`…). **Components use only these.** This lets us re-theme (light/dark) by remapping aliases, not rewriting components.

---

## 2. Primitive Palette (full scales)

### 2.1 Neutral / Steel (cool graphite grey) — the body
| Token | HEX | Typical use |
|---|---|---|
| `--neutral-0` | `#FFFFFF` | paper / data surface |
| `--neutral-25` | `#FAFBFD` | subtle raise |
| `--neutral-50` | `#F4F7FA` | page canvas (Mist) |
| `--neutral-100` | `#ECF0F5` | sunken / hover fill |
| `--neutral-150` | `#E5E9F0` | **hairline** / borders |
| `--neutral-200` | `#D6DDE7` | strong border |
| `--neutral-300` | `#BFC8D4` | disabled border / chart baseline |
| `--neutral-400` | `#97A2B0` | placeholder / disabled text |
| `--neutral-500` | `#64707E` | muted text / axis |
| `--neutral-600` | `#4A5562` | secondary text |
| `--neutral-700` | `#2B333D` | **body text** (Slate) |
| `--neutral-800` | `#20272F` | dark surface raised |
| `--neutral-850` | `#1B2128` | dark surface |
| `--neutral-900` | `#171C22` | **ink** / headings / dark canvas |
| `--neutral-950` | `#11151A` | deepest (dark bg) |

### 2.2 Cobalt — the mind (interactive / intelligent / AI)
| Token | HEX | Use |
|---|---|---|
| `--cobalt-50` | `#EEF3FF` | tint bg (info, AI surfaces) |
| `--cobalt-100` | `#DCE6FF` | hover tint |
| `--cobalt-200` | `#B9CDFF` | borders on tint |
| `--cobalt-300` | `#8FAEFF` | dark-mode accent text |
| `--cobalt-400` | `#5C87FF` | dark-mode accent / hover |
| `--cobalt-500` | `#2E6BFF` | **accent (fills, focus, UI)** |
| `--cobalt-600` | `#1F54E0` | **link / accent text on white** |
| `--cobalt-700` | `#1A45B8` | pressed |
| `--cobalt-800` | `#173A95` | deep |
| `--cobalt-900` | `#15306F` | deepest |

### 2.3 Amber — the spark (action / value / heat)
| Token | HEX | Use |
|---|---|---|
| `--amber-50` | `#FFF6EA` | tint bg (warning/value highlight) |
| `--amber-100` | `#FEEBCE` | hover tint |
| `--amber-200` | `#FBD49B` | borders on tint |
| `--amber-300` | `#F8BB66` | dark-mode action |
| `--amber-400` | `#F6A53E` | hover (action) |
| `--amber-500` | `#F5961E` | **primary action fill / the Spark** |
| `--amber-600` | `#DB7E0F` | pressed action |
| `--amber-700` | `#C9740B` | deep (large text only) |
| `--amber-800` | `#A35D0A` | **amber text on white (AA)** |
| `--amber-900` | `#7E480A` | deepest |

### 2.4 Gain (green ↑) & Loss (red ↓) — data only
| Token | HEX | | Token | HEX |
|---|---|---|---|---|
| `--gain-50` | `#E9F8EF` | | `--loss-50` | `#FDECEB` |
| `--gain-100` | `#CBEFD8` | | `--loss-100` | `#FAD2CF` |
| `--gain-500` | `#15A34A` | | `--loss-500` | `#E0322B` |
| `--gain-600` | `#128B40` | | `--loss-600` | `#C42822` |
| `--gain-700` | `#0E6E33` | | `--loss-700` | `#A11F1B` |

*(`-500` for fills/arrows/large; `-600/700` for small text — see §10.)*

---

## 3. Semantic Tokens — LIGHT mode (default)
Components use **only** these.

| Semantic token | → Primitive | Role |
|---|---|---|
| `--color-bg` | `neutral-50` | page canvas |
| `--color-surface` | `neutral-0` | cards, tables (paper) |
| `--color-surface-sunken` | `neutral-50` | wells, insets |
| `--color-surface-raised` | `neutral-0` | menus/modals (+ shadow) |
| `--color-surface-inverse` | `neutral-900` | dark "story" surfaces |
| `--color-hairline` | `neutral-150` | 1px dividers / borders |
| `--color-border-strong` | `neutral-200` | emphasized borders |
| `--color-text` | `neutral-700` | body text |
| `--color-text-strong` | `neutral-900` | headings / price |
| `--color-text-muted` | `neutral-500` | captions, meta, axis |
| `--color-text-placeholder` | `neutral-400` | inputs |
| `--color-text-inverse` | `neutral-0` | text on dark surfaces |
| `--color-accent` | `cobalt-500` | interactive fills, focus, selection |
| `--color-accent-text` | `cobalt-600` | links / accent text on white |
| `--color-accent-tint` | `cobalt-50` | AI/info surfaces |
| `--color-action` | `amber-500` | **the one primary action / value** |
| `--color-action-hover` | `amber-400` | action hover |
| `--color-action-press` | `amber-600` | action pressed |
| `--color-on-action` | `neutral-900` | **ink text on amber** (AA 7.5:1) |
| `--color-action-text` | `amber-800` | amber text on white (rare) |
| `--color-focus` | `cobalt-500` | focus ring |
| `--color-gain` | `gain-500` | price up (fill/arrow) |
| `--color-gain-text` | `gain-700` | price-up small text |
| `--color-loss` | `loss-500` | price down |
| `--color-loss-text` | `loss-600` | price-down small text |
| `--color-overlay` | `rgba(15,19,24,0.55)` | modal scrim |

---

## 4. Semantic Tokens — DARK mode
Used now for the **dark "story" surfaces** (home/AI), and as the full theme for the future app. Remap aliases only.

| Semantic token | → Primitive | Note |
|---|---|---|
| `--color-bg` | `neutral-950` | dark canvas |
| `--color-surface` | `neutral-900` | dark card |
| `--color-surface-raised` | `neutral-800` | menus/modals |
| `--color-hairline` | `rgba(255,255,255,0.08)` | subtle keyline |
| `--color-border-strong` | `neutral-700` | |
| `--color-text` | `neutral-100` | body on dark |
| `--color-text-strong` | `neutral-0` | headings/price |
| `--color-text-muted` | `neutral-400` | meta |
| `--color-accent` | `cobalt-400` | brighter for dark |
| `--color-accent-text` | `cobalt-300` | links on dark |
| `--color-action` | `amber-500` | (amber-400 for hover) |
| `--color-on-action` | `neutral-900` | ink still reads on amber |
| `--color-focus` | `cobalt-400` | |
| `--color-gain` | `gain-500` | (gain-400 if needed) |
| `--color-loss` | `loss-500` | |
| `--color-overlay` | `rgba(0,0,0,0.6)` | |

> **Theming rule:** never hardcode a primitive in a component; switch `:root[data-theme="dark"]` to remap. Story surfaces can opt into dark locally via a `surface-inverse` scope.

---

## 5. Functional / Data Colors (sacred)
- **Gain (up):** `--color-gain` fill + ↑ arrow; small text `--color-gain-text`.
- **Loss (down):** `--color-loss` + ↓ arrow; small text `--color-loss-text`.
- **Neutral (unchanged):** `--neutral-500` + «—», no color.
- **Rule:** these colors appear **only** in نوسان cells, the ticker, and charts. Seeing green/red anywhere else is a bug. Never use green/red for buttons, links, or decoration. Always pair color with a **non-color cue** (arrow/sign) for color-blind users.

---

## 6. Status / Feedback Colors (forms, toasts, validation)
Kept tight; reuse the system so feedback never competes with the action-amber.
| Status | Surface (bg) | Text/Icon | Border |
|---|---|---|---|
| **Success** | `gain-50` | `gain-700` | `gain-100` |
| **Error** | `loss-50` | `loss-600` | `loss-100` |
| **Warning** | `amber-50` | `amber-800` | `amber-200` |
| **Info / AI** | `cobalt-50` | `cobalt-600` | `cobalt-200` |
> **Disambiguation:** *interactive action* amber = `--color-action` (filled CTA, ink text). *Warning* uses amber **tint + amber-800 text** (never a filled amber button) so the two never read alike.

---

## 7. Interactive States
| Element | Default | Hover | Active/Press | Focus | Disabled | Selected |
|---|---|---|---|---|---|---|
| **Primary (action)** | `action` fill + `on-action` text | `action-hover` | `action-press` | + `focus` ring | `neutral-200` fill / `neutral-400` text | — |
| **Secondary (cobalt)** | `cobalt-600` fill, white text | `cobalt-700` | `cobalt-800` | `focus` ring | muted | — |
| **Ghost/Tertiary** | transparent, `accent-text` | `cobalt-50` fill | `cobalt-100` | ring | `neutral-400` | — |
| **Link** | `accent-text` | underline + `cobalt-700` | — | ring | `neutral-400` | — |
| **Input** | `surface` + `hairline` | `border-strong` | — | `focus` ring + `cobalt-200` glow | `neutral-50` bg | — |
| **Table row** | `surface` | `neutral-50` fill | — | ring | — | `cobalt-50` left-marker |
| **Rail item** | name (ink) | image + `cobalt` outline | — | ring | muted | image + `cobalt` bar |
- **Focus ring (global):** 2px `--color-focus` with 2px offset; visible on all interactive elements (keyboard).
- **The Spark:** on a fresh-price publish / primary press / AI wake → a brief `amber-500` glow/pulse (≤300ms, reduced-motion: none).

---

## 8. AI & Spark
- **AI presence = Cobalt.** The AI hero, the «آهن‌تایم» chip, the spark mark, suggested chips, and streaming cursor use cobalt cues (`accent`, `accent-tint`). This teaches *cobalt = smart*.
- **The Spark accent = Amber.** The single amber glow marks "intelligence/value just happened" (AI begins, price fresh, primary action).

---

## 9. Surfaces, Elevation & Overlay (graphite-paper rhythm)
- **Story surfaces** (home hero, AI, brand bands): `surface-inverse` (graphite/ink) — premium, architectural.
- **Data surfaces** (tables, SKU, admin, forms): `surface` (white paper) — maximum legibility.
- **Elevation:** flat by default; only menus/modals get **one** soft shadow: `0 8px 24px rgba(16,22,30,0.12)` (light) / `0 8px 24px rgba(0,0,0,0.5)` (dark). No shadow on cards/rows. **No glassmorphism.**
- **Overlay/scrim:** `--color-overlay` behind modals/drawers.

---

## 10. Accessibility — Contrast Matrix (WCAG)
Verified ratios for key pairs (✓ = passes for stated use):
| Foreground | Background | Ratio | Use | Verdict |
|---|---|---|---|---|
| `text-strong #171C22` | white | ~16:1 | headings/price | ✓ AAA |
| `text #2B333D` | white | ~12:1 | body | ✓ AAA |
| `text-muted #64707E` | white | ~5.0:1 | captions | ✓ AA |
| `accent-text #1F54E0` | white | ~6.2:1 | links/body | ✓ AA |
| `cobalt-500 #2E6BFF` | white | ~4.5:1 | large/UI only | ✓ AA (not <16px) |
| white | `cobalt-600 #1F54E0` | ~6.2:1 | cobalt button | ✓ AA |
| `on-action #171C22` | `amber-500` | ~7.5:1 | amber button text | ✓ AAA |
| `amber-800 #A35D0A` | white | ~5.1:1 | amber text | ✓ AA |
| `gain-700 #0E6E33` | white | ~6.4:1 | up text | ✓ AA |
| `loss-500 #E0322B` | white | ~4.5:1 | down (arrow+text) | ✓ AA |
| `loss-600 #C42822` | white | ~5.7:1 | down small text | ✓ AA |
| `text-inverse #FFF`/`neutral-100` | `neutral-900` | ~14–16:1 | text on dark | ✓ AAA |
**Rules:** body text ≥ 4.5:1; large/UI ≥ 3:1; never set body text in `cobalt-500`, `amber-500/700`, or `gain-500`. Color is **never the only signal** (always arrow/sign/icon/label too).

---

## 11. Usage Rules (do / don't)
- **Do** keep one amber action per view; reserve cobalt for interactive/intelligent; keep green/red to data only.
- **Do** build separation with hairlines and surface tone, not color.
- **Don't** color-code categories, add gradients, tint large areas with accent, or use amber for warnings-as-buttons.
- **Don't** put body text on accent fills; don't use color without a non-color cue.
- **The 10% accent budget** is a hard ceiling per view — if it feels colorful, remove color.

---

## 12. Data-Visualization Palette (charts — price history)
Restrained, datasheet-grade:
| Element | Token |
|---|---|
| Primary line | `cobalt-500` |
| Area fill under line | `cobalt-500 @ 10%` |
| Positive segment / up | `gain-500` |
| Negative segment / down | `loss-500` |
| Gridlines | `hairline (#E5E9F0)` |
| Baseline / zero | `neutral-300` |
| Axis labels | `text-muted` |
| Crosshair/marker | `amber-500` (the read-point spark) |
- Mostly **mono** (cobalt) + gain/loss for direction. For the rare multi-series, add `neutral-600` then `amber-500` (sparingly). Never a categorical rainbow.

---

## 13. CSS Variables (ready to implement)
```css
:root{
  /* primitives */
  --neutral-0:#FFFFFF; --neutral-25:#FAFBFD; --neutral-50:#F4F7FA; --neutral-100:#ECF0F5;
  --neutral-150:#E5E9F0; --neutral-200:#D6DDE7; --neutral-300:#BFC8D4; --neutral-400:#97A2B0;
  --neutral-500:#64707E; --neutral-600:#4A5562; --neutral-700:#2B333D; --neutral-800:#20272F;
  --neutral-850:#1B2128; --neutral-900:#171C22; --neutral-950:#11151A;
  --cobalt-50:#EEF3FF; --cobalt-100:#DCE6FF; --cobalt-200:#B9CDFF; --cobalt-300:#8FAEFF;
  --cobalt-400:#5C87FF; --cobalt-500:#2E6BFF; --cobalt-600:#1F54E0; --cobalt-700:#1A45B8;
  --cobalt-800:#173A95; --cobalt-900:#15306F;
  --amber-50:#FFF6EA; --amber-100:#FEEBCE; --amber-200:#FBD49B; --amber-300:#F8BB66;
  --amber-400:#F6A53E; --amber-500:#F5961E; --amber-600:#DB7E0F; --amber-700:#C9740B;
  --amber-800:#A35D0A; --amber-900:#7E480A;
  --gain-50:#E9F8EF; --gain-100:#CBEFD8; --gain-500:#15A34A; --gain-600:#128B40; --gain-700:#0E6E33;
  --loss-50:#FDECEB; --loss-100:#FAD2CF; --loss-500:#E0322B; --loss-600:#C42822; --loss-700:#A11F1B;

  /* semantic — light */
  --color-bg:var(--neutral-50); --color-surface:var(--neutral-0); --color-surface-sunken:var(--neutral-50);
  --color-surface-raised:var(--neutral-0); --color-surface-inverse:var(--neutral-900);
  --color-hairline:var(--neutral-150); --color-border-strong:var(--neutral-200);
  --color-text:var(--neutral-700); --color-text-strong:var(--neutral-900); --color-text-muted:var(--neutral-500);
  --color-text-placeholder:var(--neutral-400); --color-text-inverse:var(--neutral-0);
  --color-accent:var(--cobalt-500); --color-accent-text:var(--cobalt-600); --color-accent-tint:var(--cobalt-50);
  --color-action:var(--amber-500); --color-action-hover:var(--amber-400); --color-action-press:var(--amber-600);
  --color-on-action:var(--neutral-900); --color-action-text:var(--amber-800);
  --color-focus:var(--cobalt-500);
  --color-gain:var(--gain-500); --color-gain-text:var(--gain-700);
  --color-loss:var(--loss-500); --color-loss-text:var(--loss-600);
  --color-overlay:rgba(15,19,24,.55);
  --shadow-raised:0 8px 24px rgba(16,22,30,.12);
}
:root[data-theme="dark"]{
  --color-bg:var(--neutral-950); --color-surface:var(--neutral-900); --color-surface-raised:var(--neutral-800);
  --color-surface-inverse:var(--neutral-900); --color-hairline:rgba(255,255,255,.08); --color-border-strong:var(--neutral-700);
  --color-text:var(--neutral-100); --color-text-strong:var(--neutral-0); --color-text-muted:var(--neutral-400);
  --color-accent:var(--cobalt-400); --color-accent-text:var(--cobalt-300); --color-accent-tint:rgba(46,107,255,.12);
  --color-action:var(--amber-500); --color-on-action:var(--neutral-900); --color-focus:var(--cobalt-400);
  --color-overlay:rgba(0,0,0,.6); --shadow-raised:0 8px 24px rgba(0,0,0,.5);
}
```

---

## 14. Color Application by Surface
| Surface | Canvas | Accent behavior |
|---|---|---|
| **Home hero / AI** | `surface-inverse` (graphite) | cobalt for AI; one amber CTA; the Spark |
| **Price tables / SKU** | `surface` (white paper) | ink data; نوسان green/red only; one amber «ثبت درخواست» |
| **Trust / marketing bands** | alternating graphite ↔ paper | minimal accent; logos in mono/duotone |
| **Forms / request / پیش‌فاکتور** | white | cobalt focus; amber primary submit |
| **Admin** | white, dense | cobalt interactive; amber save/publish; red stale flag (status, not data-color misuse — uses `loss` semantics intentionally for "needs attention") |

---

## 15. Bridge
- Realizes Design Language §4.3 (color behavior) precisely.
- **Next document: Typography System** (Estedad/Vazirmatn/Inter scale, weights, numerals, the price-as-hero treatment) — pairs with these colors to form the foundations, before the Component Library.

*Ahantime — اول مشورت، بعد خرید.*
