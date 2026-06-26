# Ahantime — Typography System
## Layer 3 · UI / Design System — Document 3 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `brand/brand-book.md`, `design/design-language.md`, `design/color-system.md`.
**Purpose:** The complete, exact typography system — typefaces, Persian typographic rules, the modular scale, numerals & the "price-as-hero" datasheet treatment, mixed-script handling, tokens, accessibility, and ready-to-implement CSS. Typography is our primary hierarchy tool (type-led, per the Design Language), so this must be exact.

### Principles
1. **Type-led hierarchy** — rank by **size, weight, space**; never by decoration or color.
2. **Persian-first craft** — Persian composition is the primary design, executed with real typographic care (نیم‌فاصله, numerals, leading).
3. **The number is the hero** — prices/data are set like a precision datasheet, tabular and confident.
4. **Restraint** — one heading weight per view; a tight, deliberate scale.

---

## 1. Typefaces

| Family | Script | Role | Source / license | Weights used |
|---|---|---|---|---|
| **Estedad** (variable) | Persian + Latin | Display, headings, body, UI, buttons — the brand voice | SIL OFL, self-hosted | 400 / 500 / 600 / 700 / 800 |
| **Vazirmatn** (variable) | Persian + Latin | **Numeric / tabular data** — price tables, ticker, charts, پیش‌فاکتور amounts | SIL OFL, self-hosted | 400 / 500 / 600 / 700 |
| **Inter** | Latin | Latin-only contexts: logo wordmark, app-store text, rare English | SIL OFL | 500 / 700 / 800 |

- **Why two Persian faces:** Estedad carries the brand voice; **Vazirmatn is used wherever numbers must align** because its **tabular figures** are reliable at small sizes and in dense tables. (If Estedad's `tnum` proves solid in QA, data may consolidate to Estedad to cut payload — single source switch.)
- **All open-source** → zero licensing cost, fully embeddable on the web and in the app.

### Fallback stacks
```
--font-fa: "Estedad", "Vazirmatn", "Segoe UI", Tahoma, system-ui, sans-serif;
--font-num: "Vazirmatn", "Estedad", "Segoe UI", Tahoma, sans-serif;
--font-latin: "Inter", system-ui, "Segoe UI", Roboto, Arial, sans-serif;
```

---

## 2. Persian Typography — exact rules (this is what makes it look *crafted*, not auto-translated)

1. **نیم‌فاصله / ZWNJ (U+200C) is mandatory.** Use it in prefixes/suffixes and compounds: «می‌خواهم»، «آهن‌تایم»، «خانه‌ها»، «به‌روزرسانی»، «قیمت‌ها». Content pipeline and the AI output must insert correct ZWNJ. **Never** a full space where a half-space belongs.
2. **Persian numerals (۰۱۲۳۴۵۶۷۸۹) in the UI.** Inputs accept Latin/Arabic/Persian and normalize; display is Persian. Technical Latin codes are exempt (see §6).
3. **No letter-spacing (tracking) on Persian.** Persian is connected script — tracking breaks it. `letter-spacing: 0` on all Persian. (Tracking is allowed *only* on Latin all-caps labels.)
4. **No faux bold / no italics.** Persian has no italic; use real Estedad weights. Never synthesize bold/oblique.
5. **Generous leading.** Persian needs more line-height than Latin (tall marks, dots): **body 1.75–1.8**, headings 1.25–1.4.
6. **No kashida-justification in UI.** Text is **start-aligned (right)**; avoid `text-align: justify` (it stretches Persian badly without a real kashida engine).
7. **Persian punctuation:** comma «،», semicolon «؛», question «؟»; Persian quotes «…»; correct RTL parentheses/brackets. Use «گیومه» not "straight quotes".
8. **Bidi safety:** isolate Latin/numeric runs inside Persian with `<bdi>` / `dir` so mixed strings (e.g., «میلگرد A3 سایز ۱۴») don't reorder wrongly.
9. **Diacritics/اعراب:** generally off in UI; allowed only in rare educational content.

---

## 3. The Type Scale (modular, exact)
Base = 16px (1rem). Scale ≈ 1.2–1.25. Values: **size / line-height / weight / tracking**. Persian uses Estedad unless "Vazirmatn" noted.

| Token | Role | Font | Size (px / rem) | Line-height | Weight | Tracking |
|---|---|---|---|---|---|---|
| `--t-display` | Hero headline | Estedad | 40 / 2.5 (clamp to 30 mobile) | 1.2 | 800 | 0 |
| `--t-h1` | Page title | Estedad | 32 / 2.0 (→26) | 1.25 | 700 | 0 |
| `--t-h2` | Section title | Estedad | 26 / 1.625 (→22) | 1.3 | 700 | 0 |
| `--t-h3` | Subsection / card title | Estedad | 22 / 1.375 (→20) | 1.35 | 600 | 0 |
| `--t-h4` | Minor heading | Estedad | 18 / 1.125 | 1.4 | 600 | 0 |
| `--t-body-lg` | Lead paragraph | Estedad | 18 / 1.125 | 1.8 | 400 | 0 |
| `--t-body` | Default text | Estedad | 16 / 1.0 | 1.75 | 400 | 0 |
| `--t-body-sm` | Secondary text | Estedad | 14 / 0.875 | 1.7 | 400 | 0 |
| `--t-caption` | Meta / timestamps | Estedad | 13 / 0.8125 | 1.6 | 400/500 | 0 |
| `--t-overline` | Eyebrow/label | Estedad | 12 / 0.75 | 1.5 | 600 | 0 (Latin caps: +0.04em) |
| `--t-button` | Buttons | Estedad | 15–16 | 1 | 600 | 0 |
| `--t-label` | Form labels | Estedad | 14 | 1.4 | 500 | 0 |
| `--t-input` | Inputs | Estedad | 16 (≥16 to avoid iOS zoom) | 1.5 | 400 | 0 |
| `--t-micro` | Legal/footnote | Estedad | 12 / 0.75 | 1.5 | 400 | 0 |

**Data / numeric (Vazirmatn, tabular):**
| Token | Role | Size | LH | Weight | Notes |
|---|---|---|---|---|---|
| `--t-price-hero` | SKU page price | 40 (→32 mobile) | 1.1 | 700 | tabular; «تومان» unit at 16/muted |
| `--t-price-cell` | table قیمت cell | 16 | 1.4 | 600 | tabular; column-aligned |
| `--t-nmovement` | نوسان | 14 | 1.4 | 600 | tabular; color + arrow |
| `--t-ticker` | ticker value | 15 | 1.3 | 600 | tabular |
| `--t-data` | other table numerics (وزن, تاریخ) | 14–15 | 1.4 | 500 | tabular |
| `--t-thead` | table header | 13 | 1.4 | 600 | muted; not tabular |

> **Responsive:** Display/H1/H2/price-hero use `clamp()` to the mobile sizes in parentheses. Everything is **rem-based** so user font-scaling works.

---

## 4. Numerals & the "Price as Hero" (datasheet treatment)

- **Tabular figures everywhere data aligns:** `font-feature-settings: "tnum" 1, "lnum" 1;` on tables, ticker, charts, پیش‌فاکتور — so digit columns line up perfectly (the engineered datasheet look).
- **Persian digits** for display; the glyphs are tabular in Vazirmatn.
- **SKU price block:** `--t-price-hero` (40px/700, `text-strong`) with the unit «تومان» at `--t-caption` muted beside it; نوسان (`--t-nmovement`) with `--color-gain/loss` + arrow; freshness stamp at `--t-caption` muted.
- **Table قیمت column:** `--t-price-cell` (16/600, `text-strong`), right-edge aligned within its column; نوسان in its own cell with color+arrow.
- **Rule:** the price is the most confident element on any data surface; nothing competes with it visually.

---

## 5. Hierarchy & Usage by Context
| Context | Tokens |
|---|---|
| **Home hero (AI)** | `--t-display` headline · `--t-body-lg` subline · `--t-button` chips |
| **Section headers** | `--t-h2` + optional `--t-overline` eyebrow above |
| **Cards** | `--t-h3` title · `--t-body-sm` text |
| **Price tables** | `--t-thead` headers · `--t-price-cell`/`--t-data` cells · `--t-novement` نوسان |
| **SKU page** | `--t-h1` name · `--t-price-hero` price · `--t-body` specs |
| **AI chat** | `--t-body` messages · `--t-body-sm` system/meta · `--t-button` chips |
| **Forms / پیش‌فاکتور** | `--t-label` labels · `--t-input` fields · `--t-data` amounts · `--t-micro` notes |
| **Footer / legal** | `--t-body-sm` links · `--t-micro` legal |
| **Admin grid** | dense: `--t-data` cells · `--t-thead` headers · `--t-body-sm` controls |

**One-weight rule:** within a single view, headings use one weight (700) — vary by *size/space*, not by stacking many weights.

---

## 6. Mixed-Script & Units (bidi handling)
- **Technical Latin tokens stay Latin:** grades/standards (`A3`, `A2`, `st37`, `HEA`), profiles (`IPE140`), and brand codes (`507`). Keep upright, isolated with `<bdi>`.
- **Dimensions:** numbers in Persian digits, units preferably Persian («میلی‌متر»، «کیلوگرم»، «متر»، «شاخه»)؛ symbolic units (`mm`, `kg`) allowed but bidi-isolated.
- **Phone/price:** Persian digits; phone numbers shown LTR-isolated so they don't reorder.
- **Dates:** Jalali, Persian digits, Vazirmatn tabular (e.g., «۱۴۰۵/۰۴/۰۵»).
- Always wrap mixed runs to prevent the classic RTL number/letter reordering bug.

---

## 7. Measure, Rhythm & Alignment
- **Measure (line length):** body capped at a comfortable **~65–75 characters** (~640–720px) for readability; never full-bleed paragraphs.
- **Alignment:** Persian text **start-aligned (right)**; numeric columns aligned for scanning; headings start-aligned (centered only for the hero/empty-states by intent).
- **Vertical rhythm:** line-heights chosen on the **4px baseline** (ties to the spacing system) so text blocks stack cleanly.
- **Paragraph spacing:** space between paragraphs = ~0.75–1× line-height (no first-line indents in UI).

---

## 8. Accessibility
- **Min sizes:** body ≥ 16px; **never** below 12px for any readable text; inputs ≥ 16px (prevents iOS zoom).
- **rem-based** sizing → respects user/browser zoom and font scaling.
- **Line-height ≥ 1.5** for body (we use 1.75 for Persian comfort).
- **Contrast** handled by the color system (body ≥ 4.5:1); never rely on weight/color alone for meaning.
- **No text baked into images** for content (SEO + a11y); the table-image export is a deliberate, separate artifact.
- Respect `prefers-reduced-motion` for any text-reveal/streaming (no essential meaning conveyed only by animation).

---

## 9. Do / Don't (typography)
- **Do** use نیم‌فاصله, Persian digits, generous leading, tabular figures for data, one heading weight per view.
- **Do** isolate Latin/numeric runs (`<bdi>`/`dir`).
- **Don't** letter-space Persian, justify Persian, fake-bold/italic, or drop below 12px.
- **Don't** mix many weights/sizes for "interest"; don't color text to create hierarchy (use scale/space).
- **Don't** use straight quotes/Latin punctuation in Persian copy.

---

## 10. Font Loading & Performance
- **Self-host** variable woff2 (Estedad, Vazirmatn, Inter) — no third-party CDN dependency (important for Iran reachability).
- **Subset:** Arabic/Persian block + Latin + Persian digits + needed symbols; drop unused glyphs to shrink payload.
- **`font-display: swap`**; **preload** the primary (Estedad) + Vazirmatn weights used above the fold; lazy-load Inter.
- **Variable fonts** keep weight range in one file (smaller than many statics).
- Provide the fallback stacks (§1) so first paint is correct even before fonts load (FOUT, not FOIT).

---

## 11. CSS Implementation (ready to use)
```css
/* self-hosted variable fonts (subset) */
@font-face{font-family:"Estedad";src:url(/fonts/Estedad.var.woff2) format("woff2");
  font-weight:100 900;font-display:swap;}
@font-face{font-family:"Vazirmatn";src:url(/fonts/Vazirmatn.var.woff2) format("woff2");
  font-weight:100 900;font-display:swap;}
@font-face{font-family:"Inter";src:url(/fonts/Inter.var.woff2) format("woff2");
  font-weight:400 800;font-display:swap;}

:root{
  --font-fa:"Estedad","Vazirmatn","Segoe UI",Tahoma,system-ui,sans-serif;
  --font-num:"Vazirmatn","Estedad","Segoe UI",Tahoma,sans-serif;
  --font-latin:"Inter",system-ui,"Segoe UI",Roboto,Arial,sans-serif;

  --t-display: 800 clamp(1.875rem,1.2rem + 2.4vw,2.5rem)/1.2 var(--font-fa);
  --t-h1: 700 clamp(1.625rem,1.2rem + 1.6vw,2rem)/1.25 var(--font-fa);
  --t-h2: 700 clamp(1.375rem,1.1rem + 1vw,1.625rem)/1.3 var(--font-fa);
  --t-h3: 600 1.375rem/1.35 var(--font-fa);
  --t-h4: 600 1.125rem/1.4 var(--font-fa);
  --t-body-lg: 400 1.125rem/1.8 var(--font-fa);
  --t-body: 400 1rem/1.75 var(--font-fa);
  --t-body-sm: 400 .875rem/1.7 var(--font-fa);
  --t-caption: 500 .8125rem/1.6 var(--font-fa);
  --t-overline: 600 .75rem/1.5 var(--font-fa);
  --t-button: 600 1rem/1 var(--font-fa);
  --t-label: 500 .875rem/1.4 var(--font-fa);
  --t-input: 400 1rem/1.5 var(--font-fa);
  --t-micro: 400 .75rem/1.5 var(--font-fa);

  --t-price-hero: 700 clamp(2rem,1.5rem + 2vw,2.5rem)/1.1 var(--font-num);
  --t-price-cell: 600 1rem/1.4 var(--font-num);
  --t-movement: 600 .875rem/1.4 var(--font-num);
  --t-ticker: 600 .9375rem/1.3 var(--font-num);
  --t-data: 500 .9375rem/1.4 var(--font-num);
  --t-thead: 600 .8125rem/1.4 var(--font-fa);
}

html{font:var(--t-body);color:var(--color-text);letter-spacing:0;}
html[dir="rtl"]{text-align:right;}
h1{font:var(--t-h1)} h2{font:var(--t-h2)} h3{font:var(--t-h3)} h4{font:var(--t-h4)}
.price-hero{font:var(--t-price-hero);color:var(--color-text-strong);
  font-feature-settings:"tnum" 1,"lnum" 1;}
.price-cell,.ticker,.cell-num{font-feature-settings:"tnum" 1,"lnum" 1;}
.tnum{font-feature-settings:"tnum" 1,"lnum" 1;}
/* Persian never letter-spaced; Latin caps label exception: */
.label-latin{font-family:var(--font-latin);letter-spacing:.04em;text-transform:uppercase;}
```

---

## 12. Specimen (reference)
```
display   آهن‌تایم، مشاور هوشمند خرید آهن و فولاد            (Estedad 800/40)
h1        قیمت میلگرد امروز                                  (700/32)
h2        چرا آهن‌تایم؟                                       (700/26)
body      اول مشورت، بعد خرید؛ قیمت شفاف و تحویل تضمینی.      (400/16, lh1.75)
price     ۳۲٬۴۵۰ تومان   ↑۰٫۸٪                               (Vazirmatn 700 + gain)
caption   به‌روزرسانی: ۱۴۰۵/۰۴/۰۵ ۱۱:۰۳                       (500/13 muted)
mixed     میلگرد A3 سایز ۱۴ — ذوب‌آهن                         (bdi-isolated)
```

---

## 13. Bridge
- Realizes Design Language §4.4 (typography) + §7 (Persian craft).
- Pairs with the Color System to complete two of the three foundation pillars.
- **Next: Spacing & Layout System** (4px base grid, scale, container/12-col grid, radius, breakpoints) — the third foundation — then the **Component Library**.

*Ahantime — اول مشورت، بعد خرید.*
