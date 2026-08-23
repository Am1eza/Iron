# Phase 1 — homepage competitive advantages + translation completeness

Branch: `worktree-phase1-advantages-i18n`

Two independent pieces of work, both scoped by the owner's audit:

- **Part A** — a dedicated «چرا آهن‌تایم» competitive-advantage section on the homepage.
- **Part B** — a quality pass over the `en`/`ar`/`zh` dictionaries, plus routing the
  static marketing copy that was hardcoded Persian through `next-intl`.

---

## Part A — «چرا آهن‌تایم» on the homepage

### New files

| File | What it is |
|---|---|
| `web/src/components/home/WhyAhantime.tsx` | The section: a 6-card grid, one card per confirmed advantage. |
| `web/src/components/home/WhyAhantime.module.css` | Its styles — tokens only, logical properties only. |

It is placed in `web/src/app/page.tsx` between `CompareTeaser` and `ValueProps`.
That position is deliberate: the section answers *what this marketplace does that a
plain price list does not*, which belongs before `ValueProps` explains *how a purchase
runs* and before `Partners` shows *who already buys*. Visually it takes the plain page
surface with a hairline card grid, so it separates cleanly from `ValueProps`
(`--color-surface-sunken`) above and the dark blueprint `Partners` block below,
without inventing a new visual language. The icon treatment is copied verbatim from
`company/FeatureGrid.module.css`, the site's existing advantage-grid pattern.

### The six cards

| # | Card | Links to | What backs it |
|---|---|---|---|
| 1 | مشاور هوشمند، با حافظه | `/ai` | `ai_conversations` + `ai_corrections` — real conversation memory and a specialist correction loop. |
| 2 | پیش‌فاکتور رسمی آنی و تأمین با LC | `/prices` | The instant-proforma-by-SMS flow, بورس کالا/factory sourcing, LC for bulk. Framed as an advantage, not just a process step (it stays a step in `ValueProps` too — the two do not contradict). |
| 3 | انتخاب صنایع بزرگ | `/about` | The 22 client logos the `Partners` strip actually renders. |
| 4 | انبار مشتریان | `/warehouse` | `warehouse_items` / `warehouse_settlements`: monthly storage fee, insurance flag, contract ref, periodic settlement. Previously only a nav/footer link. |
| 5 | ابزارهای رایگان محاسبه | `/tools/project` | The 4 entries in `TOOLS_NAV`. |
| 6 | خدمات ویژهٔ B2B | `/tender` | The 4 entries in `SERVICES_NAV_FULL`. |

### Numbers

Every figure is computed server-side in `page.tsx` and passed in as `stats`. Nothing is
typed into the component, hardcoded, estimated or rounded:

- `skuCount` / `factoryCount` — the same live catalog values `HeroSearch` already uses.
- `clientCount` — `clientLogos.length` (**22** today), i.e. exactly the logos on screen.
- `toolCount` — `TOOLS_NAV.length` (**4**).
- `serviceCount` — `SERVICES_NAV_FULL.length` (**4**).

The lead paragraph is suppressed entirely when `skuCount` is 0, so an ISR render that
caught the DB cold never publishes a "0 products" sentence.

### Deliberately absent

Both exclusions are documented in the component's header comment so a later pass does
not reintroduce them:

- No "cheapest pipe price in the market" claim — unverified.
- No customer-club cashback — `club_memberships` has no cashback/refund column; the
  feature does not exist and needs its own design conversation.

---

## Part B — translation

### B1. Quality pass over the existing dictionaries

All 105 pre-existing keys were read key-by-key against the Persian meaning, not just
checked for key parity. The catalogues were in better shape than expected; the changes
made were:

| Key | Locale | Before → after | Why |
|---|---|---|---|
| `common.state.offline` | en | "You're offline" → "No internet connection" | Matches the fa meaning (the *connection* is down) and the formal register. |
| `common.state.stale` | en, ar | "Delayed" / «متأخر» → "Delayed data" / «بيانات متأخرة» | A bare adjective on a price badge reads as a delayed *shipment*; fa «با تأخیر» qualifies the data. |
| `nav.club` | en, ar | "Club" / «النادي» → "Customer Club" / «نادي العملاء» | "Club" alone is meaningless in a B2B nav. |
| `nav.content` | ar | «مقالات» → «المقالات» | Was an unarticled Persian-style noun; MSA nav labels take the definite article. |
| `nav.cooperation` | zh | 合作 → 商务合作 | 合作 alone is vague; 商务合作 is the standard B2B partnership label. |
| `common.nameLabel` | zh | 全名 → 姓名 | 全名 is a literal calque; 姓名 is the standard form-field term. |
| `phone.noCountry` | zh | 未找到国家 → 未找到相关国家/地区 | Matches `phone.country`, which already uses 国家/地区. |
| brand romanization | en, ar, zh | "Ahan Time" → "Ahantime" (71 occurrences) | The rest of the codebase and the domain both use one word; a visitor who reads "Ahan Time" cannot type the URL. |

### B2. Static copy moved out of hardcoded Persian

Newly translated across all four locales (**+62 keys**, 105 → 167):

| Where | Keys | Note |
|---|---|---|
| Homepage hero (`HeroSearch`) | `home.hero.*` | Includes the three starter chips — they are sent verbatim to the AI advisor as the visitor's own question, so they must be in the visitor's language. |
| «چطور کار می‌کند» (`ValueProps`) | `home.how.*` | |
| «چرا آهن‌تایم» (`WhyAhantime`) | `home.why.*` | New in Part A, translated from the start. |
| Mills + clients strip (`Partners`) | `home.partners.*` | Mill names themselves stay Persian — proper nouns, and the search links behind them match SKUs on that exact Persian string. |
| Category menu (`CategoryStage`) | `home.browse.*` | Chrome only; category names are DB data. |
| Compare card (`CompareTeaser`) | `home.compare.*` | Chrome only. |
| `/about` (`AboutContent`) | `about.*` | Whole page body, including the 8-item advantage grid merged in from the old `/why`. |
| `/contact` (`ContactIntro`) | `contactPage.*` | |
| Contact card (`ContactCardView`) | `contactCard.*` | |

Three components had to be restructured, because a Server Component cannot read the
client-side locale and an `async` component cannot carry `'use client'`:

- `app/about/page.tsx` → visible body extracted to `components/company/AboutContent.tsx`.
- `app/contact/page.tsx` → breadcrumbs + hero extracted to `components/company/ContactIntro.tsx`.
- `ContactCard` stays an async Server Component and does the `getContact()` fetch;
  its markup moved to `ContactCardView` (client).

`ValueProps` gained `'use client'` for the same reason. It has no state, no effects and
no observers, so it still server-renders to the same markup.

**Digits follow the locale.** `toPersianDigits` is now applied only when
`locale === 'fa'`; an English or Chinese reader sees `1059`, not `۱۰۵۹`. Same for the
step numbers in `ValueProps` and the phone numbers in `ContactCardView`.

**Deliberately left Persian** (judgement calls, per the brief):

- **Route `metadata` and all JSON-LD.** Metadata is generated at build time with no
  request context, and this i18n setup is cookie-based with no URL locale prefix — so
  there is exactly one static title/description per URL. Per-language metadata needs
  URL-prefixed locales first. The BreadcrumbList crumb labels stay Persian for the same
  reason (that is what a crawler sees on the single canonical URL); the *visible*
  breadcrumbs are translated.
- **`PriceBoard`** (the hero price panel). It is an async-fed Server Component whose
  content is Persian SKU names and a Jalali timestamp; translating its four chrome
  labels would produce a more incoherent panel, not a less one, and it is the hero's
  LCP element. Left as-is on purpose.
- **The office address** in `ContactCardView` — a half-translated Iranian postal address
  is worse than a Persian one a courier can read.

### B3. New test

`web/src/i18n/messages.test.ts` (8 tests) pins what nothing enforced before. A missing
key does not fail the build — `next-intl` renders the key path as literal text
(`home.why.warehouse.title`) in the switched locale only, which is invisible from the
Persian default. It asserts:

1. every configured locale has a catalogue, and `fa` is the default;
2. `en`/`ar`/`zh` have exactly `fa`'s key set — no missing keys, no orphans;
3. every ICU placeholder survives translation (`{count}`, `{sku}`, `{factory}`…) —
   a dropped or renamed placeholder throws at render time in that locale alone;
4. no non-Persian catalogue contains Persian-only letters (پ چ ژ گ ی ک) — the signature
   of a Persian string pasted in untranslated, including the Persian ی/ک leaking into
   Arabic where ي/ك belong.

### Translation confidence, per language

- **English — high.** Reviewed and written directly; formal B2B register, industry terms
  checked ("proforma invoice", "letter of credit (LC)", "Iran Mercantile Exchange",
  "rebar", "I-beam", "cut-to-size").
- **Arabic — medium-high.** MSA business register throughout, not Persian cognates:
  «فاتورة أوّلية» for پیش‌فاکتور, «اعتماد مستندي» for LC, «بورصة السلع الإيرانية» for
  بورس کالا, «مستودع العملاء» for انبار مشتریان. Arabic ي/ك used, never Persian ی/ک
  (now test-enforced). Eastern Arabic numerals kept where the pre-existing keys already
  used them. **Worth a native check before a real Arabic campaign:** the marketing
  headlines rather than the functional labels — `home.why.clients.title`
  («خيار كبرى الصناعات»), `home.why.services.title` («خدمات مخصصة للشركات») and
  `home.why.eyebrow` («ما يميّز Ahantime») are the ones where register, not meaning,
  is the risk.
- **Chinese — medium-high.** Simplified characters, natural Chinese word order rather
  than transliterated Persian sentence structure; standard steel-trade terms
  (螺纹钢 rebar, 工字钢 I-beam, 型材 profiles, 形式发票 proforma, 信用证 LC,
  伊朗商品交易所 IME, 定尺 cut-to-size). **Worth a native check:** `common.unit.currency`
  = 土曼 for Toman — a rare enough loanword in Chinese that 图曼 or leaving it as
  "Toman" may read better to a mainland buyer; and `home.why.title`
  (为什么选择 Ahantime？) as a marketing headline.

I did not ship anything for Arabic or Chinese I could not read back and justify term by
term, but I am not a native speaker of either — the keys flagged above are where a
native reviewer's time is best spent.

---

## What is still Persian-only, and what full catalog translation would cost

### Now translated
Static UI chrome (nav, header, footer, forms, auth, errors) **plus** all static
marketing copy on the homepage, `/about` and `/contact` — 167 keys × 4 languages.

### Still Persian in every locale, by design for this pass
The live product catalog and editorial content. These are DB rows, not dictionary
strings; translating them is a **content project, not a code change** — it needs a
translation column or table per entity, an admin editing surface, a fallback rule for
untranslated rows, and (for anything to be indexable) URL-prefixed locales, which this
cookie-based setup does not have.

### Scope estimate — measured against the live DB today (2026-08-23)

| Content | Rows | Distinct strings | Persian characters |
|---|---:|---:|---:|
| `categories.name` (active) | 8 | 8 | 54 |
| `sub_categories.name` (active) | 69 | 68 | 785 |
| `sub_categories.group_label` (active) | 53 | 18 | 596 |
| `skus.name` (active) | 782 | 782 | 18,771 |
| `articles.title` | 122 | 122 | 7,167 |
| `articles.excerpt` | 122 | 122 | 19,706 |
| `articles.body_md` | 122 | 122 | **242,914** |
| `seo` JSONB blobs (all four tables) | 131 | — | not counted |

Plus 1,147 SKU rows in total (782 active), 121 published articles, and 84 distinct mill
names.

Read as two very different jobs:

1. **Catalog only** (categories + sub-categories + SKU names): **876 distinct strings,
   ~20k Persian characters.** Highly repetitive and formulaic — "میلگرد ۱۴ آجدار A3
   ذوب آهن اصفهان" — so it is mostly a glossary problem: build a term table for
   sizes, grades and mill names and most SKU names compose from it. Realistically a
   few days of work per language once the schema and admin surface exist, and the
   result is what actually makes the price tables usable to a non-Persian buyer.
2. **Editorial content** (122 articles, ~270k characters of title + excerpt + body):
   roughly **150–200 pages of prose per language**. This is a genuine translation
   budget, not an engineering estimate, and it is also the part with the least
   commercial return for a foreign B2B buyer, who comes for prices and a proforma.

**Recommendation:** if the owner greenlights anything beyond this pass, greenlight the
catalog glossary (job 1) and treat the articles (job 2) as separate and optional. Both
need URL-prefixed locales landed first, or the translations will not be indexable.

---

## Verification

- `tsc --noEmit` — clean.
- `next lint` on every touched file — clean.
- `stylelint` on `WhyAhantime.module.css` — clean (tokens-only + logical-properties rules pass).
- `prettier --check` — clean.
- `vitest run src/i18n/messages.test.ts` — 8/8 pass.
- `next build` — clean.
- Full suite left to CI (not run on this box — past OOM).
- Live browser check after deploy: recorded below.
