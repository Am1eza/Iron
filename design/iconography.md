# Ahantime — Iconography
## Layer 3 · UI / Design System — Document 6 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `design/design-language.md`, `design/components.md`, foundations.
**Purpose:** Define the complete custom icon system — construction, style, the signature **structural category icons**, the full inventory, states, RTL mirroring, accessibility, and implementation. A bespoke, consistent icon family is a key reason the UI reads as *crafted, not templated* (Design Language §3 bans emoji and untouched icon packs).

### Principles
1. **One family, drawn by us.** A single geometric **line** set — consistent grid, stroke, terminals. Never mix icon packs; **never emoji**.
2. **Engineered, not cute.** Precise, minimal, structural — echoing technical drawing and the I-beam motif.
3. **Monoline, single-color.** `currentColor`, no fills (system icons), so an icon inherits text/cobalt/state color.
4. **Meaningful, not decorative.** An icon earns its place; if a label is clearer, use the label.

---

## 1. Construction Grid & Specs
- **Canvas:** `24 × 24` viewBox. **Live area:** 20×20 (2px outer padding/trim area) — icons never touch the edge.
- **Keyline shapes** (for optical consistency across the set): square ≈ 18×18 · circle ⌀20 · portrait rect 16×20 · landscape rect 20×16. Match an icon's mass to the relevant keyline so all icons feel the same size.
- **Stroke:** `1.75px` at 24px. **Optical sizing** (re-drawn, not just scaled): 20px → 1.5px, 16px → 1.25px, 32px → 2px. Stroke stays visually constant; never disproportionately scaled.
- **Terminals:** **round caps + round joins**; interior corners get a small `~2px` radius — refined-precise (not razor-sharp, not bubbly), consistent with the 6–8px UI radii.
- **Geometry:** built on the 4px sub-grid; aligned to pixel/half-pixel for crispness; consistent angles (prefer 0/45/90°).
- **Counters/gaps:** minimum ~2px gaps so icons stay legible at 16px.

---

## 2. Sizing Scale
| Size | Stroke | Use |
|---|---|---|
| **16** | 1.25 | inline with text, dense tables, captions |
| **20** | 1.5 | **default UI** (buttons, inputs, nav) |
| **24** | 1.75 | primary actions, touch targets, mobile |
| **32** | 2.0 | feature points, small empty-states |
| **40–64** | scaled | **category rail "image"** + empty-state glyphs |
- Icon box ≥ 44px for tap targets (icon visually 20–24, padded hit area).

## 3. Color & States
`currentColor` everywhere. States via the color tokens:
| State | Color |
|---|---|
| default | `--color-text` / `--color-text-muted` |
| interactive/active | `--color-accent` (cobalt) |
| on amber action button | `--color-on-action` (ink) |
| on dark surface | `--color-text-inverse` |
| disabled | `--neutral-400` |
| data direction | `--color-gain` / `--color-loss` (نوسان arrows only) |
- System icons stay **single-color**. The **category icons** may use **one accent** (cobalt or amber) only in their large rail-hero rendering.

---

## 4. The Signature Category Icons (core brand assets)
The 7 product categories are drawn as **structural silhouettes / cross-sections** — like an engineering (اشتال) catalog. This is ownable, instantly legible to the trade, and ties to the I-beam logo. Each exists in two renderings: **small monoline** (nav/menu) and **large rail-hero** (the name→image flip, optionally one accent + a graphite frame).

| Category | Icon concept (how it's drawn) |
|---|---|
| **میلگرد** (Rebar) | a rounded **bar with diagonal rib ticks** along it (the آجدار texture) — a ribbed rod. |
| **تیرآهن** (I-Beam) | the **I-beam cross-section** = top flange · web · bottom flange (reuses the **logo mark**). |
| **پروفیل** (Profile/Hollow) | a **hollow square tube** in slight isometric — outer square + inner square (wall), open end. |
| **ورق گرم** (Hot-rolled plate) | a **flat plate with visible thickness** and a lifted corner (a sheet/plate). |
| **ورق سرد** (Cold-rolled / coil) | a **coil/roll** (spiral end) — distinguishes CRC/coil from the flat hot plate. |
| **نبشی و ناودانی** (Angle & Channel) | an **L-angle** cross-section paired with a **U/[ channel** cross-section. |
| **لوله** (Pipe) | a **cylinder with an elliptical bore** (hollow tube end) / annulus cross-section. |

- **Consistency:** same stroke, same keyline mass, same lighting/perspective; they read as one set viewed in a steel catalog.
- **Rail-hero rendering:** the silhouette enlarged (40–64px) inside a graphite `Frame`, optional single cobalt/amber accent; crossfades from the category name on hover (Components D4). Reduced-motion → instant.

---

## 5. Full Icon Inventory
> Names are kebab-case asset ids. **M?** = mirrors in RTL (§7).

### 5.1 System / Navigation
| Icon | id | Use | M? |
|---|---|---|---|
| Menu/hamburger | `menu` | mobile nav | – |
| Close | `close` | dismiss | – |
| Chevron up/down | `chevron-up`/`down` | accordions, selects | – |
| Chevron start/end | `chevron-start`/`end` | nav, carousels | **✓** |
| Arrow back/forward | `arrow-back`/`forward` | navigation | **✓** |
| Search | `search` | search | – |
| Filter | `filter` | table filters | – |
| Sort | `sort` (asc/desc) | table sort | – (arrow part flips meaning, not shape) |
| Overflow (kebab) | `more` | row/action overflow | – |
| External link | `external` | outbound | **✓** |
| Home | `home` | breadcrumb root | – |
| Grid / List | `grid`/`list` | view toggle | – |

### 5.2 Categories (signature, §4)
`cat-rebar` · `cat-ibeam` · `cat-profile` · `cat-hot-sheet` · `cat-cold-sheet` · `cat-angle-channel` · `cat-pipe`

### 5.3 Actions
| Icon | id | Use | M? |
|---|---|---|---|
| Favorite (heart) | `heart` / `heart-fill` | علاقه‌مندی | – |
| Chart / trend | `chart` | per-row price chart | – |
| Download | `download` | Excel/PDF | – |
| File / Excel | `file-xls` | export | – |
| Image | `image` | table image w/ logo | – |
| Print | `print` | print table | – |
| Cart | `cart` | سبد استعلام | – |
| Add / plus | `plus` | add to cart | – |
| Request / document | `doc-request` | ثبت درخواست / پیش‌فاکتور | – |
| Share | `share` | share quote | **✓** (if arrowed) |
| Edit | `edit` | admin edit | – |
| Delete | `trash` | remove | – |
| Copy | `copy` | copy-yesterday | – |
| Refresh | `refresh` | reload/ticker | – |
| Check | `check` | confirm/selected | – |

### 5.4 Commerce / Data / Delivery
| Icon | id | Use | M? |
|---|---|---|---|
| Price tag | `tag` | price/offers | – |
| Up / Down arrow | `arrow-up`/`down` | **نوسان** | – (vertical) |
| Clock / delivery | `delivery-clock` | **زمان تحویل** (signature badge) | – |
| Calendar | `calendar` | dates | – |
| Scale / weight | `weight` | وزن‌سنج | – |
| Calculator | `calculator` | tools/cost | – |
| Ruler / blueprint | `blueprint` | پروژه‌سنج | – |
| Currency / dollar | `currency` | طلا و ارز | – |
| Gold / coin | `coin` | gold | – |
| Trending (ticker) | `trending` | market | – |

### 5.5 AI
| Icon | id | Use | M? |
|---|---|---|---|
| Ahantime spark | `spark` | the AI mark (4-point amber spark) | – |
| Microphone | `mic` | voice input | – |
| Send | `send` | submit message | **✓** (points to writing dir) |

### 5.6 User / Account / Engagement
| Icon | id | Use | M? |
|---|---|---|---|
| User | `user` | account | – |
| Login / Logout | `login`/`logout` | auth | **✓** (arrow) |
| Bell / alert | `bell` | قیمت‌سنج alerts | – |
| Club / medal | `medal` | باشگاه آهن‌تایم | – |
| Settings / gear | `settings` | preferences/admin | – |
| Shield / trust | `shield` | trust/eNamad context | – |

### 5.7 Status / Feedback
| Icon | id | Use |
|---|---|---|
| Success | `check-circle` | success |
| Error | `x-circle` | error |
| Warning | `triangle-alert` | warning |
| Info | `info-circle` | info / AI note |
| Stale | `clock-alert` | stale price flag |

### 5.8 Channels (brand glyphs — drawn to match stroke, NOT official logos in color)
`telegram` · `whatsapp` · `eitaa` · `instagram` · `sms` · `phone` (click-to-call) · `location` (map/address)

### 5.9 Company / Cooperation / Content
| Icon | id | Use |
|---|---|---|
| Factory / mill | `factory` | تأمین‌کنندگان |
| Handshake | `handshake` | همکاری با ما |
| News / blog | `news` | اخبار/وبلاگ |
| Customers | `users` | مشتریان |

### 5.10 Admin
`dashboard` · `catalog-box` · `pricing-grid` · `users-roles` · `content-doc` · `audit-history` · `layers` · `toggle` · `kanban`

> **Inventory total: ~80 icons.** All drawn in one family per §1.

---

## 6. Accessibility
- **Decorative icons:** `aria-hidden="true"` + `focusable="false"`.
- **Meaningful icons (icon-only buttons):** require an accessible name — `aria-label` (and visible label/tooltip where possible). **Never an icon-only control without a label** (Design + a11y rule).
- **Status icons** are paired with text/color — color is never the sole signal.
- Sufficient size/contrast; hit area ≥44px.

## 7. RTL Mirroring (precise)
- **Mirror (flip horizontally):** `chevron-start/end`, `arrow-back/forward`, `external`, `send`, `share`(if arrowed), `login/logout`(arrow), breadcrumb separator, pagination arrows, carousel/drawer-direction icons.
- **Do NOT mirror:** `search`, `user`, `cart`, `heart`, `delivery-clock`, `phone`, `bell`, `settings`, `calculator`, `weight`, category icons, channel/brand glyphs, `check`, status icons, `home`.
- **نوسان arrows** (`arrow-up/down`) are vertical → no mirror (meaning is direction of price, not reading order).
- Implement via a `[dir="rtl"] .icon--directional{transform:scaleX(-1)}` utility on flagged icons only.

## 8. Optical Alignment
- Icon + text: vertically optical-center (not strict box-center); icon sits on the inline-start of the label with `--gap-inline` (8px).
- Mixed sizes align on the text baseline/center; avoid icons looking "high."
- Square keyline ensures a 24px icon and a 24px icon of different shapes feel equal.

## 9. Implementation
- **Format:** inline SVG (themeable via `currentColor`) for app icons; an **SVG sprite** (`<symbol>`) or per-icon React/Vue components, tree-shakeable.
- **SVG conventions:**
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <!-- paths on the 24 grid, 2px trim -->
</svg>
```
- **No hardcoded color/size** inside SVG (size via CSS `width/height: 1em` or token; color via `currentColor`).
- **Optimization:** SVGO; strip metadata; consistent path direction; ≤ a few hundred bytes each.
- **Naming:** `icon-{id}` (e.g., `icon-delivery-clock`, `icon-cat-ibeam`).
- **Category icons** ship two variants: `cat-{x}` (line) and `cat-{x}-hero` (large, framed, optional accent).

## 10. Do / Don't
- **Do** keep one family, one stroke logic, round terminals, `currentColor`, optical sizing, ≥44px targets, labels for meaningful icons.
- **Don't** use emoji, mix icon packs, mix filled+line randomly, scale stroke disproportionately, color status by icon alone, or mirror non-directional icons.

## 11. Illustration / Empty-state glyphs (icon-adjacent)
- Spot art is **line-based, derived from the icon family** — primarily the **I-beam motif** and category silhouettes. Empty states use a large (40–64px) muted structural glyph + message + CTA (Components C6).
- No stock 3D, no mascots, no decorative isometric scenes (banned, DL §3). (A full illustration spec, if needed, gets its own doc.)

## Bridge
- Completes the visual vocabulary (color · type · space · components · **icons**).
- **Next recommended:** Motion/Interaction spec, then high-fidelity screens — and the **live HTML style tile** to validate icons + color + type + spacing together.

*Ahantime — اول مشورت، بعد خرید.*
