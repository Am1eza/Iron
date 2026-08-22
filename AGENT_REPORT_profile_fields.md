# AGENT REPORT — پروفیل price pages rebuilt on ahanonline's model

**Date:** 1405/05/31 (2026-08-22) · **Branch:** `worktree-profile-fields` ·
**PR:** [#224](https://github.com/Am1eza/Iron/pull/224) ·
**Commit:** `5cba1d7` · **Worktree:** `/opt/ahantime/.claude/worktrees/profile-fields`

---

## 1 · What I kept from the retained worktree diff, and why

The uncommitted diff in `.claude/worktrees/profile-fields` was good and I built
on it rather than restarting. Kept **unchanged in mechanism**:

| Piece | Verdict |
|---|---|
| `factoryIsMeaningful(categorySlug, subCategorySlug)` + `PROFILE_NO_FACTORY_SUBS` in `catalogLabels.ts` | **Kept.** Right shape. Re-verified every slug in the set against the live DB — all six are the real active sub-category slugs (`prvfyl-snaty`, `profil-mobli`, `profil-sotuni`, `profil-galvanizeh`, `profil-z`, `prvfyl-astyl`), and `prvfyl-sakhtmany` is correctly excluded. |
| Suppression applied in `catalogRepo.toPriceRow` | **Kept.** One DTO boundary means table, cards, spec sheet, facet rail, sitemap, export and AI grounding agree for free — confirmed visually: the «قیمت پروفیل بر اساس کارخانه» facet rail present in the before shots is gone in the after shots without any change to that component. |
| `AttrKey`/`AttrColumn`/`attributeColumns` generalisation of the grade column | **Kept.** |
| `SkuDetail`, `SkuDrawer`, `BulkQuote` edits | **Kept.** `BulkQuote`'s «مقایسهٔ کارخانه‌ها» self-suppressing when no row has a mill is exactly right — visible in the before/after Z pair. |
| Tests `PriceTable.profileFields.test.tsx`, `profileFactory.pg.test.ts` | **Kept and extended.** |

**Changed:**

- `FactorySection` → `SectionShell`, `byFactory` → `bySection`, `showFactory` →
  a three-valued `groupMode` (`factory` \| `region` \| `none`). The retained
  diff's binary "factory or one flat table" could not express the region case.
- The `<details>` `id` stays `factory-section-${i}` and the `?factory=` deep
  link still resolves against it — renaming would have broken existing inbound
  links from the home hero board for no user-visible gain.
- `ExportMenu` — not touched by the retained diff. Its «کارخانه» column would
  have exported «نامشخص» on every پروفیل row; it now substitutes «محل تولید»
  (a substitution, never an extra column — the image export uses a fixed pixel
  grid).
- `SkuDetail` and the mobile price card gained a «محل تولید» line, so the fact
  the desktop table carries in a section heading is not lost on a phone or on
  the product page.

Nothing was discarded.

---

## 2 · The region reconstruction

`regionFromFactory()` (in `catalogLabels.ts`) recovers a producing city from
the *withheld* mill string by **whole-token** match against the freight city
list this repo already maintains — `src/lib/data/logistics.ts`'s `CITIES`
(16 cities, road distances from the Shadabad warehouse). I did not write a new
city list.

Whole tokens, not substrings: «قم» and «ساری» are substrings of many unrelated
Persian words, and a substring match would silently invent a region. ZWNJ
(U+200C) counts as a token boundary alongside whitespace.

> **This is a heuristic best-effort reconstruction from data the catalog
> already held — NOT scraped ahanonline data and NOT verified regional
> sourcing data.** That caveat is written into the JSDoc of
> `regionFromFactory`, of `SKU.region`, and of the `toPriceRow` branch that
> derives it, so a future reader cannot mistake it for sourced fact.

### Results per sub-category (live DB, active SKUs, verified 2026-08-22)

| Sub-category (slug) | Active rows | Resolved to a city | Coverage | Outcome |
|---|---:|---:|---:|---|
| پروفیل صنعتی `prvfyl-snaty` | 1 | 1 — اصفهان («صنعتی اصفهان») | 100 % | **region sections** — one «قیمت پروفیل اصفهان» |
| پروفیل ستونی `profil-sotuni` | 6 | 3 — مشهد ×2, تهران ×1 | 50 % | **region sections** — تهران · مشهد · نامشخص(3) |
| پروفیل Z `profil-z` | 7 | 4 — تهران ×2, مشهد ×2 | 57 % | **region sections** — تهران(2) · مشهد(2) · نامشخص(3) |
| پروفیل گالوانیزه `profil-galvanizeh` | 5 | 1 — اصفهان («پایا اصفهان») | 20 % | **flat fallback** + «محل تولید» column |
| پروفیل مبلی `profil-mobli` | 1 | 0 («نیکان پروفیل») | 0 % | **flat fallback**, no column |
| پروفیل ساختمانی `prvfyl-sakhtmany` | 0 | — | — | unchanged; keeps «کارخانه» by design |
| پروفیل استیل `prvfyl-astyl` | 0 | — | — | no priced stock (see §3) |

Names that resolved to nothing, all correctly: «نیکان پروفیل», «کیان پرشیا»,
«جهان پروفیل پارس», «پروفیل یاران», «پروفیل صابری».

### Why 50 %

`REGION_COVERAGE_MIN = 0.5`. Below it the page would be one large «نامشخص»
section plus a couple of one-row cities — a structure advertising a regional
story the data cannot tell. At 50 % the named sections carry at least as many
rows as the unknown bucket. گالوانیزه (20 %) is exactly the case this guards
against; its one resolved city survives as a **column** instead, so the fact
is not thrown away.

«نامشخص» always sorts last in region mode. Factory mode's «سایر» bucket is
deliberately **not** changed — it has ranked by cheapest-price among unplaced
mills since US-18.2 and `PriceTable.factoryOrder.test.tsx` asserts that. (My
first pass sank both buckets and broke that test; caught and scoped.)

---

## 3 · Attribute-column decision table — as specified, verified live

| Sub | Factory/region | Grade field | Verified in screenshot |
|---|---|---|---|
| صنعتی | region grouping | «گرید» → «طول شاخه» → **۶ متر** | ✅ `after-prvfyl-snaty.png` |
| ساختمانی | **factory kept** | unchanged | ✅ `after-prvfyl-sakhtmany.png` (0 rows) |
| مبلی | flat (0 resolved) | unchanged «گرید» | ✅ `after-profil-mobli.png` |
| ستونی | region grouping | unchanged «گرید» | ✅ `after-profil-sotuni.png` |
| گالوانیزه | flat + column | unchanged «گرید» | ✅ `after-profil-galvanizeh.png` |
| Z | region grouping | «گرید» → «طول سفارشی» → **بر اساس سفارش** | ✅ `after-profil-z.png` |
| استیل | region grouping | «آلیاژ» **+** «طول شاخه» (both) | code + unit test only — 0 rows live |

**Active استیل slug re-verified:** `prvfyl-astyl` (active, 0 SKUs).
`profil-steel` is **inactive** with 0 SKUs, and `prvfyl-snaty` is a distinct
sub-category, not the steel counterpart. The retained diff had this right.
The spec's "populate real 201/304/316 where known" could not be actioned:
there are no استیل SKUs at all to populate. The column set is in place and
unit-tested, and will render correctly the moment stock is added.

---

## 4 · SKU deactivations

**None were needed.** Re-checked against the live DB:

```sql
select sc.slug, s.size, count(*) from sub_categories sc
  join skus s on s.sub_category_id = sc.id
  join categories c on c.id = sc.category_id
 where c.slug='profile' and sc.is_active and s.is_active
 group by 1,2 having count(*) > 1;
-- 0 rows
```

No active پروفیل sub-category has two active SKUs at the same size, so there is
no cheapest-per-size contest to resolve. `profil-mobli` already had 4 of its 5
SKUs soft-deleted (`is_active = false`) by earlier work — `profile-furniture-32`,
`-33`, `-34`, `-35` — leaving `profile-furniture-31` (۶۰×۶۰) active. Nothing
was deactivated by this task, and no row was hard-deleted.

---

## 5 · Open items and findings (not fixed — needs an owner call)

### 5.1 · Three پروفیل sub-category URLs 308 to the category page

`redirects` carries active rows sending three sub-pages to `/prices/profile`:

| from | to | created |
|---|---|---|
| `/prices/profile/prvfyl-snaty` | `/prices/profile` | 2026-08-14 |
| `/prices/profile/prvfyl-sakhtmany` | `/prices/profile` | 2026-08-14 |
| `/prices/profile/prvfyl-astyl` | `/prices/profile` | 2026-08-14 |

They were created while those subs were empty. **`prvfyl-snaty` now has a live
priced SKU** (`profile-80x80`, ۱۰۸٬۱۸۲ ت/kg, `branch_length_m = 6`), so its
own page — the one this task's «طول شاخه» change is most visible on — is
unreachable. The content is still reachable through the sub-filter chip on
`/prices/profile`, which is how I did the visual QA.

I did **not** change this: the `redirects` table has no `is_active` column, so
removing a redirect means a `DELETE`, and CLAUDE.md §8 forbids deleting
production data unprompted. It also brushes against the standing note that
some empty sub-categories are deliberately live and empty.
**Recommendation:** delete the `prvfyl-snaty` row (it has real stock now);
decide `prvfyl-sakhtmany` / `prvfyl-astyl` alongside whether those subs are
meant to be publicly visible while empty.

### 5.2 · «محل تحویل» column — deliberately not added

ahanonline's «محل تحویل» reads «کارخانه» as an *ex-works delivery term*. This
repo has no per-SKU delivery-terms field, and its one authoritative delivery
fact points the other way: `logistics.ORIGIN_LABEL` is «انبار شادآباد تهران»
and `estimate.service.landedCost` prices every order as shipping from that
warehouse. A hardcoded «کارخانه» column would be a fresh fabrication replacing
the one this task removes, and a hardcoded «انبار» column adds nothing a buyer
does not already read in the freight panel. Adding it properly needs a
`delivery_terms` column and admin input — a schema change and an owner
decision, out of scope here.

### 5.3 · «نوسانات» — already present

No fake history was invented. The «نوسان» column / `MovementBadge` already
computes this; it is visible in every screenshot.

### 5.4 · Pre-existing data oddities noticed, not touched

- Most پروفیل Z / ستونی / گالوانیزه rows render «تماس بگیرید» because their
  prices are stale (last updated 04/16 and 05/28). Price-freshness behaviour,
  not a regression.
- `profil-galvanizeh` ۲۰×۲۰ is ۴۴٬۵۵۰ ت/kg against ~۱۷۲٬۷۲۷ for its siblings,
  and `profil-mobli` ۶۰×۶۰ is ۱۵۰٬۹۰۹ against ~۴۵٬۰۰۰ for its deactivated
  siblings. Both look like data-entry errors worth an admin review.
- Six پروفیل sub-categories with real priced stock are **inactive** and
  therefore invisible: `box-rect`(5), `box-square`(6), `chaharpahlu`(14),
  `chaharpahlu-alloy`(5), `congress`(6), `frame`(6) — 42 priced SKUs. Same
  pattern as the previously-recorded stranded-sub-category issue. Not touched.

---

## 6 · Screenshots

All in `.claude/worktrees/profile-fields/shots/` (untracked; 1440px viewport,
full page). `before-*` were taken against the live production container
through Caddy; `after-*` against a build of this branch wired to the **same
production database**, so any difference is the code, not the data.

| File | Shows |
|---|---|
| `before-profil-z.png` | «۷ کالا · ۵ کارخانه»; five fabricated mill sections («تهران شرق», «فولاد مشهد», «جهان پروفیل پارس», «پروفیل یاران», «پروفیل صابری»); «کارخانه» column; empty «گرید» column; «مقایسهٔ کارخانه‌ها» panel; «قیمت پروفیل بر اساس کارخانه» facet rail |
| `after-profil-z.png` | «۷ کالا · ۳ محل تولید»; quick-jump chips تهران/مشهد/نامشخص; three region sections with «نامشخص» last; «طول سفارشی» = «بر اساس سفارش»; no «کارخانه» anywhere; no mill-comparison panel; no factory facet rail |
| `before/after-prvfyl-snaty.png` | after: one «قیمت پروفیل اصفهان» section, «۱ کالا · ۱ محل تولید», «طول شاخه» = ۶ متر |
| `before/after-profil-sotuni.png` | after: تهران · مشهد · نامشخص sections, «گرید» kept |
| `before/after-profil-galvanizeh.png` | after: flat table, «محل تولید» column (اصفهان on ۸۰×۴۰, «نامشخص» on the rest), «گرید» kept |
| `before/after-profil-mobli.png` | after: flat table, no «محل تولید» column at all |
| `before/after-prvfyl-sakhtmany.png`, `*-prvfyl-astyl.png` | «۰ کالا» — unchanged, no priced stock |

---

## 7 · Verification

- `tsc --noEmit` — clean.
- `next lint` scoped to all 11 touched files — clean (only pre-existing
  repo-wide warnings in untouched files).
- Prettier reports the same formatting drift on `main` for these files, and
  Prettier is not in CI — left alone rather than mixing a reformat into this diff.
- No CSS changed, so no stylelint run was needed.
- **431 tests green** across `src/components/catalog`, `src/lib/server/repos`,
  `src/lib/utils`, `src/lib/seo`, `src/lib/server/catalog.test.ts`. Ran in
  Docker with a 4 GB cap, scoped by path — the full suite was **not** run on
  this box (documented OOM risk).
  - `PriceTable.profileFields.test.tsx` — 14 tests, 5 new for region grouping:
    sections + ordering, «محل تولید» naming of the count and the quick-jump nav,
    the flat fallback below threshold, the single-city section, and a real mill
    outranking region grouping in the mixed «همه» view.
  - `catalogLabels.test.ts` — new `regionFromFactory` (including the
    substring/ZWNJ cases), `groupModeFor`, `groupKeyFor` blocks.
  - `profileFactory.pg.test.ts` — 7 tests; three new assert the region is
    derived at the DTO boundary, that no row ever publishes both a mill and a
    region, and that a category which kept its factories gets no region.

---

## 8 · Deploy status — **MERGED AND CI-GREEN, NOT DEPLOYED**

- PR #224 CI: `checks` **pass** (4m37s), `e2e` **pass** (4m38s).
  `Workers Builds: ahantime` and `Deploy preview to GitHub Pages` failed —
  both are the documented pre-existing noise, red on `main` independently of
  any PR.
- Squash-merged to `main` as **`4f8b60e`** at 2026-08-22 22:43 UTC.
- `Deploy to production server`: **`build` job green** — the image
  `ghcr.io/am1eza/iron-web:4f8b60e93f88ece860514bf563db6590b7cf7f4c` was built
  and pushed to GHCR successfully. The **`deploy` job failed** at the image
  pull on this host:

  ```
  Error response from daemon: Get "https://ghcr.io/v2/":
  net/http: TLS handshake timeout
  ```

  The workflow's own `git fetch`/`reset --hard` step DID succeed, so
  `/opt/ahantime` is now checked out at `main@4f8b60e`; only the container
  image was not updated.

- I retried the pull manually twice, spaced out. Both returned a **different**
  failure — `Error response from daemon: error from registry: denied`. So on
  this host `ghcr.io` is now reachable but the stored credential in
  `~/.docker/config.json` is being rejected, in addition to the intermittent
  TLS timeout the runner hit. Minting or rotating a GHCR token is an owner
  action, so I stopped rather than looping.

- **Production is unchanged and healthy**:
  `ahantime-web-1` still runs `ghcr.io/am1eza/iron-web:35cff26…` and
  `https://ahantime.com/prices/profile` returns 200. The پروفیل changes are
  merged but **not yet live**.

**To finish the deploy**, once GHCR auth works from this host:

```bash
docker login ghcr.io -u <user>            # the current credential is rejected
docker pull ghcr.io/am1eza/iron-web:4f8b60e93f88ece860514bf563db6590b7cf7f4c
docker image inspect ghcr.io/am1eza/iron-web:4f8b60e93f88ece860514bf563db6590b7cf7f4c
sed -i 's#^WEB_IMAGE=.*#WEB_IMAGE=ghcr.io/am1eza/iron-web:4f8b60e93f88ece860514bf563db6590b7cf7f4c#' /opt/ahantime/.env
docker compose up -d web
```

Then verify (note: ISR pages serve mock data briefly after a deploy — wait for
revalidation before judging a page wrong):

```bash
curl -sk --resolve ahantime.com:443:127.0.0.1 https://ahantime.com/prices/profile   # 200
docker exec ahantime-web-1 grep -rl 'محل تولید' .next/
```
