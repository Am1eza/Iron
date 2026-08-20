# Products navigation redesign — desktop mega-menu, mobile drawer, factory links

**Date:** 1405/05/29 (2026-08-20) · **Branch:** `worktree-nav-redesign`

The owner's verdict on the products menu was «خیلی داغون». This is what was
actually wrong, what replaced it, and the evidence.

---

## 1. What was wrong

### 1.1 Desktop mega-menu — the layout fought the catalog

All 9 top-level categories rendered as simultaneous columns in one
`repeat(4, 1fr)` grid. The catalog's shape makes that unworkable:

| Category | Active sub-categories |
|---|---|
| میلگرد | 5 |
| تیرآهن | 4 |
| پروفیل و قوطی | 7 |
| **ورق** | **19** |
| **نبشی و ناودانی** | **3** |
| لوله | 10 |
| کلاف و مفتول | 8 |
| استیل | 11 |
| فلزات رنگی | 12 |

> **These counts are a snapshot, not a spec.** They are what the live taxonomy
> held on 1405/05/29 while this work was done, and the screenshots below show
> that state. The catalog is actively being edited: by the time this shipped,
> کلاف و مفتول had been set `is_active = false` by someone else and فلزات رنگی
> had gained ناودانی آلومینیوم (#209), so the deployed menu renders **8**
> categories, not 9. That is the menu working — `getCategories()` filters on
> `is_active` and the rail is sized by the category *count*, whatever it is.
> Do not read any number in this document as the current taxonomy; query
> `categories` / `sub_categories` for that.

A 3-item column next to a 19-item column, wrapped over three rows, gave the
panel a natural height of ~1,225px. It was capped at 720px with
`overflow-y: auto` and a scroll-shadow gradient — but at 1440×900 (see
`before-desktop-mega.png`) only the **first four categories were visible at
all**. استیل and فلزات رنگی — two entire product lines, 23 sub-categories —
were below an internal scroll boundary with no affordance announcing it. A real
customer could use the menu and never learn they existed. Every sub-category
added made it worse, and the catalog is still growing.

### 1.2 Mobile — one accordion, ~80 chips

«محصولات» expanded into a single flat run of all 9 categories and every
sub-category as pill/chip elements, with no per-category collapse. Measured on
the live site at 390px: **2,987px of scroll, 109 links** in one open panel
(`before-mobile-products.png`). Reaching فلزات رنگی meant scrolling past
everything else. On a Persian B2B audience that is majority-mobile, this was
the worse of the two problems.

### 1.3 The `group_label` rendering bug

Sub-categories sharing a `group_label` rendered the label as bare,
unstyled, non-interactive text. Where the label is *also the name of one of its
members* — which is the common case, because a group gets created by adding a
variant beside an existing sub-category — the result read as a broken
duplicate:

```
چهارپهلو          ← plain text, looks like a dead link
  چهارپهلو        ← the actual link
  چهارپهلو آلیاژی
```

Live instances: `profile/chaharpahlu` + `profile/chaharpahlu-alloy` (both
`group_label = 'چهارپهلو'`). Visible in `before-desktop-mega.png` and
`before-mobile-products.png`. The same bug was present on the homepage's
`CategoryStage` flyout.

### 1.4 The mega-menu did not exist for any crawler

`ProductsMenu` was registered in `components/lazy.ts` with `ssr: false`, **and**
`NavDropdown` mounted its panel only on open. Both together meant not one of
the menu's ~90 internal links ever appeared in any page's HTML. Measured on the
live site: the homepage HTML carried 33 distinct `/prices/*` URLs, and every
sub-category link among them belonged to میلگرد. The site's densest internal-link
surface was invisible to Google and to any answer engine.

### 1.5 Mill names were only clickable in price tables

`FactoryCell` (PR #198) linked mill names to
`/prices/[category]/factory/[factory]` — but only inside `PriceTable`. Verified
still correctly wired (`/prices/rebar` → 21 factory URLs, all 200). Everywhere
else a mill name was dead text, and the homepage category flyout linked mills to
`?factory=…` query URLs, which have no page, no canonical, and nothing indexable
behind them.

---

## 2. What replaced it

### 2.1 Desktop: a category rail beside one category's panel

`ProductsMenu.tsx` + `ProductsMenu.module.css` (new).

```
┌──────────────────────────────────────────────┬───────────────┐
│  ورق                        قیمت روز ورق ›   │ ▸ میلگرد    ۵ │
│  ┌────────┐ سیاه     عرشه فولادی  آلوزینک   │ ▸ تیرآهن    ۴ │
│  │ photo  │ روغنی    تسمه         قلع‌اندود  │ ▸ پروفیل    ۷ │
│  │        │ گالوانیزه ساندویچ پانل ورق پانچ  │ ■ ورق      ۱۹ │
│  └────────┘ …                                │ ▸ نبشی      ۳ │
│                                              │ ▸ لوله     ۱۰ │
│                                              │ ▸ کلاف      ۸ │
│                                              │ ▸ استیل    ۱۱ │
│                                              │ ▸ فلزات    ۱۳ │
└──────────────────────────────────────────────┴───────────────┘
```

The decisive property: **the rail's height depends only on the category count,
never on what any category contains.** All 9 are always visible. Only the active
category's sub-categories are laid out, so their count drives a local
multi-column flow (`columns`, which balances 3 and 19 alike) instead of the
height of the whole menu. A future category with 80 sub-categories widens its own
flow and, past a ceiling, scrolls its own pane — it cannot push a sibling
off-screen.

This is also the pattern the homepage's own `CategoryStage` already uses, so it
is this site's established idiom, not a new one to learn. It is how ahanonline
organises the same taxonomy.

Details that matter:

- **Sub-category counts in the rail** (Persian digits, tabular numerals), free
  from data already in memory — no extra query. They tell you before you hover
  that ورق is deep and نبشی و ناودانی is shallow.
- **Column count comes from the block count** (`data-cols`), not from CSS
  guessing: four short blocks spread over three columns read as orphans. The
  1- and 2-column cases are width-capped, because `columns` always stretches to
  fill its container — uncapped, two columns put «میلگرد آجدار» and «میلگرد
  ساده» ~340px apart and read as two unrelated lists.
- **The category's product photo** takes the leftover width, pinned to the far
  edge. It is why a 3-sub-category panel and a 19-sub-category panel both look
  like a designed panel rather than scattered orphans, and it reuses
  `ProductImage`/`CategoryArt` — no new design system, no new assets.
- **Opens on whatever you are already looking at.** On `/prices/sheet` the menu
  opens showing ورق, confirming where you are instead of resetting you to میلگرد.
- **Interaction is conventional**: hover or focus a rail row to switch, click it
  to go to that category's price table. Nothing needs explaining.

### 2.2 The group_label fix — one rule, three shapes

New `groupSubCategories()` in `lib/utils/catalogGroups.ts` refines
`groupByLabel`'s clusters for display by lifting out the member whose name *is*
the label:

| Case | Renders as |
|---|---|
| Label names one of its members (چهارپهلو) | That member becomes the heading — **one interactive link** — with the rest indented beneath |
| Label names no member (مانیسمان) | The label is a real heading, set as an overline so it cannot read as a broken link |
| No label | Just its own link |

Applied in all three consumers: the desktop mega-menu, the mobile drawer, and
the homepage `CategoryStage`. See `after-desktop-group-fix.png` (چهارپهلو →
چهارپهلو آلیاژی) and `after-desktop-mega-pipe-group.png` (مانیسمان as a heading
over its two children). Comparison is on the trimmed name, so a stray space in
an admin-entered label cannot resurrect the duplicate.

Four unit tests cover it in `catalogGroups.test.ts`.

### 2.3 Mobile: a two-level accordion

`MobileDrawer.tsx` + `.module.css`. «محصولات» now expands to **9 category rows
that fit on one screen** (`after-mobile-products-collapsed.png`), each with its
sub-category count. Each row holds two independent targets: the name links to
the category's price table, a separate 48px chevron button expands its
sub-categories in place. One category open at a time.

Splitting the two matters: collapsed into one control, anyone who wants
«همه‌ی ورق» would have to expand 19 sub-categories first and then scroll back
past them.

Sub-categories are now **rows, not chips**. A chip row packs tightly, which is
right for six short labels and wrong for «آلوزینک (گالوالوم)» beside «ورق پانچ
سیاه»: wrapping was unpredictable, group headings had to fake their own line
break with `flex-basis: 100%`, and nothing lined up to scan down. Rows behind a
single leader rule read as one list and give every label a full-width 44px
target.

**Measured:** drawer scroll height with «محصولات» open went from **2,987px → 1,621px**,
and all 9 categories are reachable without scrolling.

### 2.4 SEO / GEO / AEO

Four concrete changes, no keyword stuffing anywhere:

**a. The menu is now a real internal-link surface.** `ProductsMenu` is imported
directly by `Header` (not via `lazy.ts`), and `NavDropdown` gained a
`keepMounted` mode that renders the panel on every paint and only toggles the
`hidden` attribute. `hidden` removes the panel from the tab order and the
accessibility tree exactly as unmounting did, while leaving the anchors in the
document for a parser.

> **Measured on the deployed site** (`main@f330abe`): distinct `/prices/*`
> hrefs in the homepage HTML went from **33 → 99**. The real gain is larger
> than that ratio suggests: **18 of the old 33 were `?factory=` query variants
> of one URL** (`/prices/rebar/deformed`), which have no page behind them — so
> distinct *pages* linked from the homepage went from **15 → 99**.
> Cost: **13.2KB raw / 1.4KB gzipped** per page.

The simple dropdowns deliberately still mount on open — they duplicate links the
footer already publishes, so there is nothing to gain.

**b. Descriptive anchor text and real heading structure.** Every panel is headed
by an `<h2>` carrying the category name, and its "see all" link reads
«قیمت روز ورق», not a generic «مشاهده» — the anchor text says what is on the
other side of the click, to a human scanning and to a model reading anchor text.
The rail is a named `<nav>` landmark (`aria-label="دسته‌بندی‌های اصلی"`).

**c. `ItemList` of `SiteNavigationElement`** — new `catalogNavigationJsonLd()` in
`lib/seo/index.ts`, published on the homepage and the `/prices` hub only (not
site-wide, where it would be the same list repeated on every article and tool
page). Verified output: **9 categories, 80 sub-categories**, each with its
Persian name and canonical URL.

Google publishes no rich result for `SiteNavigationElement`, and this is not
here pretending otherwise. What it does is state, in a vocabulary crawlers and
answer engines already parse, the single fact a marketplace most needs an
assistant to get right — *what this site sells* — as a named, ordered list with a
canonical URL each, rather than leaving it to be inferred from anchor text
scattered through a menu. An LLM asked "what does آهن‌تایم sell?" can answer from
this alone. It mirrors the rendered menu exactly (same arrays, same order, same
names, same URLs), which is the condition for it being honest structured data
rather than the invisible-keyword kind.

**d. Query-string mill URLs replaced by real pages** — see below.

### 2.5 Factory links everywhere a mill name appears

`FactoryCell` was extracted from `PriceTable` into
`components/catalog/FactoryLink.tsx`, so there is one answer to "what happens
when you click a mill name", and it is the same answer everywhere.

Wired up:

| Surface | Before |
|---|---|
| `home/CategoryStage` (homepage flyout) | `?factory=…` query URL — no page, no canonical |
| `home/CompareTeaser` | plain text |
| `market/CategoryPriceSummary` (×2, table + card) | plain text |
| `market/FeaturedPrices` (×2, table + card) | plain text |
| `catalog/SkuDetail` (×2, spec table + hero attrs) | plain text |
| `catalog/BulkQuote` (mill comparison) | plain text |
| `catalog/PriceTable` | already linked — now delegates |

**Deliberately left alone**, with reasons:

- **`app/search`** — the whole result row is already a `<Link>` to the SKU;
  nesting an anchor inside an anchor is invalid HTML.
- **`tender/TenderEstimator`** — the mill names are `<option>` elements inside a
  `<select>`. Not linkable.
- **`ai/AdvisorChat`** — conversational message bodies, a different surface with
  its own rules. Worth a separate decision by the owner.

**Measured on the production build:** homepage went from 0 factory-landing links
(18 `?factory=` query links) to **18 factory-landing links and zero `?factory=`**.

### 2.6 A pre-existing interaction bug, fixed on the way

`NavDropdown`'s click handler was a plain toggle. On any pointer device,
entering the trigger fires `mouseenter` → panel opens; the click that follows
immediately toggled it *shut*. So anyone who clicks a menu rather than hovering
it — the ordinary habit, and the only gesture on a touch-capable laptop — saw it
flash and vanish. This affected all five header dropdowns, not just محصولات, and
it was reproducible on the live site.

Now: hover shows it, a click **pins** it, a second click dismisses it, and
leaving with the pointer only closes what was never pinned. Esc, outside-click
and route changes clear both states.

---

## 3. Accessibility

- **Keyboard order follows the layout, not the DOM.** Every panel is a sibling of
  the whole rail (the rail is one grid column, the panels share the other), so
  raw DOM order would send Tab through all nine rail rows and only then into
  whichever panel happened to be showing at the end. Redirected, Tab reads the
  way the menu looks. Verified live:

  ```
  محصولات (trigger) → میلگرد → قیمت روز میلگرد → میلگرد آجدار →
  میلگرد حرارتی → کوپلر میلگرد → میلگرد ساده → میلگرد استیل → تیرآهن → …
  ```

  Focus landing on the next rail row switches the panel through the same
  `onFocus` a pointer would, so the two stay in step with no extra machinery.
  The `offsetParent === null` guard means a closed menu never swallows a Tab.

- `aria-expanded` / `aria-controls` on the trigger, `aria-current` on the rail row
  for the category you are on, `aria-label` on both `<nav>` landmarks and on each
  mobile disclosure button (`زیردسته‌های ورق`).
- Counts carry a visually-hidden «زیردسته» so they are not read as bare numbers.
- The category photo is `aria-hidden` — the heading beside it is the label.

**axe-core 4.12.1, WCAG 2.0/2.1/2.2 A + AA — zero violations** on all three:
the header with the mega-menu open, the whole `/prices/sheet` page with it open,
and the mobile drawer at 390px with a category expanded.

---

## 4. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint --dir src` | clean — zero errors; the 12 pre-existing warnings are all in files this pass did not touch |
| `stylelint "src/**/*.css"` | clean (tokens-only + logical properties enforced) |
| `next build` | ✓ compiled, 146/146 static pages generated |
| Targeted vitest | 89 passed — `catalogGroups` (7), `ProductsMenu` (4, new), `SiteChrome` (4), all `components/catalog` (74) |
| axe-core AA | 0 violations (3 contexts, above) |

Per the standing rule for this box, the **full** suite was not run here — 16GB
shared with 11 live containers, and a prior full run OOM'd the VPS. GitHub
Actions CI is the source of truth for that.

Everything visual was verified against a real `next build` + `next start`
preview wired to the live database, at **1440×900** and **390×844**, on a
3-sub-category category (نبشی و ناودانی), a 19-sub-category one (ورق), and both
`group_label` shapes.

### Evidence

| Before | After |
|---|---|
| `before-desktop-mega.png` — 4 of 9 categories visible, rest cut off | `after-desktop-mega.png` — all 9 in the rail |
| | `after-desktop-mega-sheet.png` — ورق, 19 subs in 3 balanced columns, no scroll |
| | `after-desktop-mega-angle.png` — نبشی و ناودانی, 3 subs, same panel height |
| `before-mobile-products.png` — 2,987px of chips | `after-mobile-products-collapsed.png` — 9 categories on one screen |
| `before-mobile-drawer.png` | `after-mobile-products-expanded.png` — one category open, group heading correct |
| (duplicate «چهارپهلو» visible in both before shots) | `after-desktop-group-fix.png`, `after-desktop-mega-pipe-group.png` |

---

## 5. Follow-ups (not done, deliberately)

1. **Category descriptions for AEO.** `categories.seo` is a `jsonb` column that
   already has a `description` field, and it is empty for all 9. A one-line
   admin-entered description per category, rendered in the panel header and fed
   into the JSON-LD, would be the single highest-value AEO addition left. Not
   hardcoded here: per the owner's standing position on display order, catalog
   copy belongs in the admin panel, not in code.
2. **Mill names inside the AI advisor's messages** — see §2.5.
3. **`web/ROUTING.md`** still documents the abandoned Persian-slug scheme. Noted
   in `CLAUDE.md` already; untouched by this pass.
