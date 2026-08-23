# AGENT_REPORT — the پروفیل duplicate-slug situation, investigated and closed

**Date:** 1405/06/01 (2026-08-23) · **Branch:** `profile-slug-cleanup-1787441979` · **Base:** `ec45fc3` (post-#226)

## The headline

**The brief's diagnosis was backwards, and following it would have hidden a priced product.**

The three `prvfyl-*` پروفیل sub-categories are not leftovers from the PR #224 re-slug awaiting
retirement. They are the **current** sub-categories, created by the owner on **2026-08-21** —
*ten days after* the `profil-*` rows they appear to duplicate were retired. The `profil-*` rows are
the retired half. Row age, not slug spelling, decides which is canonical here.

So there was **no orphaned inventory to migrate** (brief step 2) and **nothing redundant to
deactivate** (step 3). What existed was exactly what step 4 described: three stale `redirects` rows
shadowing live routes. Those are gone, and every affected URL now serves 200.

| Brief step | Verdict |
|---|---|
| 1 · Investigate every old/new pair | Done. **3 pairs, not 21** — the "21" was the sub-category *count* under پروفیل |
| 2 · Migrate orphaned SKUs | **Not performed — no orphan exists.** The 1 SKU is already on the correct, live row |
| 3 · Deactivate redundant old slugs | **Not performed — they are not redundant.** Deactivating them would hide a priced SKU and strand shipped code |
| 4 · Remove orphaned redirect rows | **Done** — 3 deleted, 1 repointed, 1 chain collapsed |
| 5 · Sitemap verification | Done — full production crawl, 1,226/1,226 × 200 |
| 6 · Full verification | Done — tsc, lint, 650 tests, `next build`, live crawl |
| 7 · PR | Opened. **Not merged** — see *Merge decision* |

---

## 1. The definitive pair table

Every sub-category under `profile` (`c3`), grouped by Persian display name. Only three names
appear twice; the rest are unique.

| Persian name | Old-style slug | active? | active SKUs | New-style slug | active? | active SKUs | Same products? |
|---|---|---|---|---|---|---|---|
| پروفیل صنعتی | `prvfyl-snaty` | **✔** | **1** | `profil-sanati` | ✘ | 0 | n/a — the new-style row was **always empty** |
| پروفیل ساختمانی | `prvfyl-sakhtmany` | **✔** | 0 | `profil-sakhtemani` | ✘ | 0 | n/a — both empty |
| پروفیل استیل | `prvfyl-astyl` | **✔** | 0 | `profil-steel` | ✘ | 0 | n/a — both empty |

No SKU has ever existed under any of the three `profil-*` rows. There is no pair anywhere in
پروفیل where the same product sits under two slugs, and no pair where the old slug holds stock the
new slug lacks. The premise of steps 2 and 3 does not occur in the data.

The other 15 پروفیل sub-categories are single-slug: four live under `profil-*` names
(`profil-mobli`, `profil-sotuni`, `profil-galvanizeh`, `profil-z`) and eleven retired.

### Why the earlier report said "21"

There are exactly **21 sub-category rows** under پروفیل. That count — not a count of pairs — is
what got carried into the brief as "roughly 21 پروفیل sub-categories may exist as pairwise
duplicates." The three example pairs it named are the three real ones.

## 2. What actually happened, from `audit_entries`

| When | What |
|---|---|
| 2026-08-01 11:06–11:11 | Owner creates «پروفیل ساختمانی / صنعتی / استیل» in the panel. `slugify()` derives `prvfyl-sakhtmany`, `prvfyl-snaty`, `prvfyl-astyl`. |
| 2026-08-04 04:33 | `renameCatalogSlugs.ts` (PR #224) renames **those same rows** to `profil-sakhtemani` / `profil-sanati` / `profil-steel` and writes old→new redirects. |
| 2026-08-14 01:42 | All three are still empty, so they are retired: `is_active = false`, and **both** the old and the new URL are repointed to `/prices/profile`. This is when the three rows stopped being slug→slug maps and became retire-to-parent rows. |
| **2026-08-21 21:40** | Owner creates the three sub-categories **again** — new ULIDs, `is_active = true`, ordered into place beside the live ones. `slugify()` derives `prvfyl-*` a second time, straight into the retired URLs. |
| 2026-08-21 21:46 | Owner adds «پروفیل صنعتی ۸۰×۸۰» (`profile-80x80`, `branch_length_m = 6`, `unit = meter`) under پروفیل صنعتی. |
| 2026-08-22 19:04 | The SKU is priced: **۱۰۸٬۱۸۲ تومان/kg**. |

The `prvfyl-*` rows are twelve hours *newer* than the retirement that buried their URLs.

### The shipped code agrees with that reading

PR #224's own application code is keyed on the `prvfyl-*` slugs, not the `profil-*` ones:

- `src/lib/utils/catalogLabels.ts` — `PROFILE_NO_FACTORY_SUBS` contains `prvfyl-snaty` and
  `prvfyl-astyl`; `PROFILE_ATTRS` gives `prvfyl-snaty` its «طول شاخه» column and `prvfyl-astyl`
  its «آلیاژ» + «طول شاخه» columns.
- `src/lib/server/services/priceSync.match.ts` — maps `profile/prvfyl-snaty` to its
  ahanonline source table.
- `src/lib/server/repos/profileFactory.pg.test.ts`, `catalogLabels.test.ts` — same slugs.

Deactivating `prvfyl-snaty`/`prvfyl-astyl` would have left all of that pointing at nothing, and
hidden the ۱۰۸٬۱۸۲ ت/kg SKU site-wide (every public read filters `sub_categories.is_active`).

## 3. Root cause — still open, deliberately not fixed here

`slugify()` (`src/lib/utils/slugify.ts`) drops Persian short vowels: «پروفیل» → `prvfyl`,
«صنعتی» → `snaty`. The admin panel auto-derives the slug from the Persian name, so **any row an
admin recreates gets the pre-#224 spelling back**. `renameCatalogSlugs.ts` corrected the *data*
with a hand-written map and left the slugifier alone.

Compounding it, `POST /api/admin/catalog/subcategories` never checks whether a `redirects` row
already claims the URL it is about to publish. Nothing warns the admin; the page simply 308s away.

This is not پروفیل-specific — any category can hit it. **Recommended follow-up (own PR):** on
sub-category create/update, reject (or at minimum warn) when `redirects.from_path` already claims
the resulting public path, pointing the admin at the redirects panel. Not done here because it
touches an admin write path and this PR is meant to stay a verifiable data fix.

---

## 4. Every row changed — the full audit

Applied by `web/scripts/unshadowProfileSubCategories.ts --apply`, in **one transaction**, against
the production database on 2026-08-23 ~00:35 UTC.

### Sub-category rows changed: **none**

Not one `sub_categories` row was touched — no `is_active` flip in either direction.

### SKU rows changed: **none**

No SKU was re-parented, deactivated, or edited. `profile-80x80` sits where the owner put it.

### `redirects` rows DELETED — 3

| id | from_path | to_path |
|---|---|---|
| `01KZ5GSC66J1265SA5Y1VTYZTG` | `/prices/profile/prvfyl-snaty` | `/prices/profile` |
| `01KZ5GSC5VA6ZTC38HKRTZ376B` | `/prices/profile/prvfyl-sakhtmany` | `/prices/profile` |
| `01KZ5GSC6EJ4FXS71VX3D90THG` | `/prices/profile/prvfyl-astyl` | `/prices/profile` |

Each `from_path` is now a live route in its own right, so there is no "old URL" semantics left to
preserve — the row was pure shadow. `redirects` has no `is_active` column
(`id, from_path, to_path, permanent, created_at, updated_at`), so removal is necessarily a
`DELETE`; there is no soft form. This is why the script's guard is strict: a row is removed **only**
when its `from_path` is an *active* sub-category **and** its `to_path` is that sub-category's own
parent category page. A genuine slug→slug map can never match that shape, and the script aborts
rather than guess.

### `redirects` rows UPDATED — 2

| id | from_path | to_path before | to_path after | why |
|---|---|---|---|---|
| `01KZYYZ74F8V5B5PWGCGH7PGWX` | `/prices/profile/profil-sanati` | `/prices/profile` | `/prices/profile/prvfyl-snaty` | The retired slug's live same-named twin exists again and carries stock, so the old URL should land on the product page, not one level up |
| `01KZ5GSC8C4J1HT6PF0FRYQKS0` | `/prices/astyl/prvfyl-astyl` | `/prices/steel/profil-steel` | `/prices/profile` | Collapses a two-hop 308→308 chain. Same final destination, one fewer hop — asserted, not assumed |

### Deliberately left alone

| Row | Why |
|---|---|
| `/prices/profile/profil-steel` → `/prices/profile` | Correct retire-redirect. Repointing it at the live `prvfyl-astyl` would send crawlers to an **empty** page; the category is the better landing |
| `/prices/profile/profil-sakhtemani` → `/prices/profile` | Same |
| `/prices/steel/profil-steel` → `/prices/profile` | A `steel`-category taxonomy question (`steel` has its own live `profile` = پروفیل استیل sub). Out of scope; flagged, not guessed at |
| `sub_categories.prvfyl-sakhtmany`, `prvfyl-astyl` (active, empty) | Owner-created active-and-empty on 2026-08-21. That matches this catalog's established, owner-directed pattern for empty-but-live sub-categories; they now render as real pages like the rest |

**Rollback**: the pre-change state of all five rows is preserved as INSERT statements in the report
appendix below.

---

## 5. Verification

### Live production, before → after

| URL | before | after |
|---|---|---|
| `/prices/profile/prvfyl-snaty` | **308** → `/prices/profile` | **200** |
| `/prices/profile/prvfyl-snaty/profile-80x80` | 200 (unreachable in practice) | **200** (reachable) |
| `/prices/profile/prvfyl-astyl` | **308** → `/prices/profile` | **200** |
| `/prices/profile/prvfyl-sakhtmany` | **308** → `/prices/profile` | **200** |
| `/prices/profile/profil-sanati` | 308 → `/prices/profile` | 308 → `/prices/profile/prvfyl-snaty` |
| `/prices/astyl/prvfyl-astyl` | 308 → `/prices/steel/profil-steel` (→ 308) | 308 → `/prices/profile` |

`/prices/profile/prvfyl-snaty` renders «پروفیل صنعتی 80×80» with its price. The two empty
sub-categories serve their (empty) pages, as intended.

### Sitemap — step 5

- **1,226 `<loc>` entries**. The three unshadowed sub-category pages are advertised again — the
  sitemap's redirect gate (PR #226) had been suppressing exactly those three, and now suppresses
  nothing. `/prices/profile/prvfyl-snaty/profile-80x80` was already listed (the gate matches
  `from_path` exactly, and no row ever claimed the SKU URL); it is now reachable from its own
  sub-category page rather than only from the category page's filter chip.
- **No `profil-sanati` / `profil-steel` / `profil-sakhtemani` URL leaks in** — those rows are
  inactive, so the catalog queries never emit them.
- SQL cross-check: **zero** sitemap paths match any `redirects.from_path`.
- **Full HTTP crawl of all 1,226 URLs against production: 1,226 × 200. Zero 404s, zero 308s.**
  (Crawled at ~2.5 req/s — per the earlier report, a faster crawl induces spurious 502s from this
  origin.)

### Code gates — step 6

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint` on all 3 touched files | clean |
| `vitest` — `sitemap.test.ts`, `catalogLabels.test.ts`, `redirectsRepo.test.ts` | 59/59 pass |
| `vitest` — full `src/lib/server/**` + `src/lib/utils/**` (55 files) | 591/591 pass |
| `next build` in Docker | green |

Per the repo's OOM note, the *entire* `vitest run` suite was not run on this host — CI runs it.

### Idempotency

Re-running the script with no flags reports "Nothing to do." Every step recomputes from the
database, so a second `--apply` is a no-op.

---

## 6. Changes in this PR

| File | Change |
|---|---|
| `web/scripts/unshadowProfileSubCategories.ts` | **new** — the repair, dry-run by default, one transaction, precondition-guarded, idempotent. Its header is the full investigation record |
| `web/src/app/sitemap.ts` | comment only — the redirect gate's note said the three 308s were "orphaned by the پروفیل re-slug". They were not; corrected, and the gate is kept with the real reason it still matters |
| `web/src/app/sitemap.test.ts` | comment only — same correction to the test's narrative note. **No test behaviour changed**; the fixture is a faithful record of the historical case |

No production code path changed. The DB changes are already live (they are what the verification
above measures); the code diff is documentation plus the script that performed them.

---

## 7. Merge decision

**Opened, not merged.** The data change is done, verified end-to-end against production, and low
risk. But this PR's *value* is the corrected causal record, and the brief's own instruction was to
stop short of merging if there is any doubt. There is one thing worth a human's eye first:

> The brief asked for three `prvfyl-*` sub-categories to be **deactivated**. They were not — doing
> so would have hidden a priced product. If the owner's actual intent on 2026-08-21 was to move
> پروفیل onto the `profil-*` slugs and they simply re-created the rows by hand without realising
> the panel would re-derive the old spelling, then the right end state is different from this one:
> rename the three live rows to `profil-*`, update `catalogLabels.ts` and `priceSync.match.ts` to
> match, and re-point the redirects. That is a product decision about URLs, not a data-hygiene fix,
> and it is not one to make unprompted.

Either way the change here is correct and strictly better than the previous state — three URLs that
308'd away now serve, and one of them sells something. Nothing in it blocks the larger rename if
the owner wants it.

CI status should be checked before merge; per CLAUDE.md, `Deploy preview to GitHub Pages` and
`Workers Builds: ahantime` are known-red independently of any change.

---

## Appendix — rollback SQL

```sql
-- Restores the exact pre-change state of all five affected rows.
BEGIN;
DELETE FROM redirects WHERE from_path IN (
  '/prices/astyl/prvfyl-astyl', '/prices/profile/prvfyl-sakhtmany',
  '/prices/profile/prvfyl-snaty', '/prices/profile/prvfyl-astyl',
  '/prices/profile/profil-sanati');
INSERT INTO redirects (id,from_path,to_path,permanent,created_at,updated_at) VALUES
 ('01KZ5GSC8C4J1HT6PF0FRYQKS0','/prices/astyl/prvfyl-astyl','/prices/steel/profil-steel',true,'2026-08-04 04:33:54.078523+00','2026-08-04 04:33:54.078523+00'),
 ('01KZ5GSC5VA6ZTC38HKRTZ376B','/prices/profile/prvfyl-sakhtmany','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.676866+00'),
 ('01KZ5GSC66J1265SA5Y1VTYZTG','/prices/profile/prvfyl-snaty','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.67817+00'),
 ('01KZ5GSC6EJ4FXS71VX3D90THG','/prices/profile/prvfyl-astyl','/prices/profile',true,'2026-08-04 04:33:54.078523+00','2026-08-14 01:42:46.679061+00'),
 ('01KZYYZ74F8V5B5PWGCGH7PGWX','/prices/profile/profil-sanati','/prices/profile',true,'2026-08-14 01:42:46.671683+00','2026-08-14 01:42:46.671683+00');
COMMIT;
-- middleware caches redirects for 60s.
```
