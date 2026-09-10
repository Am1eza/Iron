# UX audit — content/homepage/search: final summary

Worktree: `/Users/amirreza/Iron-ux-audit-content` (untouched: `/Users/amirreza/Iron`,
the sibling `ux-p0-audit` job's directory). All 5 items from the brief were addressed;
5 PRs opened against `Am1eza/Iron`, all left open (not merged) for owner review, per
instructions. Full detail, reasoning, and per-fix evidence: `AGENT_REPORT_ux_audit_content.md`
in this same directory.

## PRs opened

| # | Title | Covers | CI (`checks` / `e2e` / Workers Builds) |
|---|---|---|---|
| [#253](https://github.com/Am1eza/Iron/pull/253) | Split homepage hero into two clear CTAs, compress Category Stage | Item #1 | fail* / pass / fail (known-red) |
| [#254](https://github.com/Am1eza/Iron/pull/254) | Show a featured-articles preview on /blog | Item #2 | fail* / pass / fail (known-red) |
| [#256](https://github.com/Am1eza/Iron/pull/256) | Add a read-time badge to article cards | Item #3 | fail* / pass / fail (known-red) |
| [#257](https://github.com/Am1eza/Iron/pull/257) | Collapse article TOC, add reading progress | Item #4 | fail* / pass / fail (known-red) |
| [#259](https://github.com/Am1eza/Iron/pull/259) | Rank common sub-categories first, add search filters + autocomplete | Item #5 | pending at write time — recheck |

\* `checks` (the typecheck CI job) is failing on **`main` itself right now**
(`scripts/repairSeedPrices.ts`, a `SeedRow`/`grade` type error), independent of and
unrelated to any of these 5 branches — verified locally (identical single error on every
branch, nowhere near any file this work touched) and via `gh run list --branch main`
(CI red on main's current HEAD). `e2e` — the suite that would actually catch a real
regression in what changed — is green on every PR checked. `Workers Builds: ahantime` is
the secondary Cloudflare target CLAUDE.md already documents as red on `main` independent
of any PR. **Recommendation: don't block merge on `checks` for these 5 PRs** — it'll very
likely go green once whoever owns `repairSeedPrices.ts` fixes it on `main` and these are
rebased. Full detail in the agent report.

## What each PR does, one line each

1. **#253** — Split the hero's single dense block into a primary "مشاهده قیمت‌ها" CTA and
   secondary "محاسبه پروژه با مشاور" CTA; trimmed the Category Stage flyout panel from
   ~520px to ~440px (smaller decorative photo, tighter padding — the category click path
   itself was already 1 click, nothing to shorten there). Trust/logo carousel: reviewed,
   found already fixed by a commit 4 weeks before this audit — no change, flagged as likely
   stale in the PR.
2. **#254** — Added a capped (≤4 cards) "تازه‌ترین مطالب" preview above the category rail
   on `/blog`, reusing the already-fetched article list. **Flagged for explicit owner
   review** — it sits close to a documented 2026-08-08 product decision to hide the flat
   article list; I judged the preview differently-scoped/positioned enough not to
   contradict it, but want a second opinion before this merges.
3. **#256** — Read-time badge on article cards, computed DB-side (word count via SQL, not
   a full-body fetch) so it doesn't undo an earlier perf fix. Hero images were already
   working; author field skipped (no such data in the schema).
4. **#257** — TOC now groups by H2 with H3s collapsed behind a `<details>` disclosure
   (same pattern as the existing FAQ accordion), capped at 8 top-level entries; added a
   small reading-progress bar to both blog and news article pages.
5. **#259** — Fixed a real ranking-ties bug (verified with a manufactured exact tie in a
   pglite test, confirmed the fix isn't accidental by flipping it and watching the test
   fail) using the existing `subCategories.order` column; added `?type=` result filter
   chips; added a debounced autocomplete dropdown to `SearchBar` — attempted (not deferred)
   because the backing `/api/search` endpoint the brief expected to have to build already
   existed.

## Explicitly skipped / deferred, and why

- "پربازدیدترین" (most-viewed) blog section — no view-count data in the schema; brief
  permitted skipping.
- Author name/bio on article cards — no public author field in the schema; brief said not
  to fabricate one.
- `HeroVideo.tsx` pause control — untouched, explicit owner exclusion per the brief.
- Sibling `ux-p0-audit` job's scope/directory — untouched.

## For the owner

The one item that most needs a human decision before merging: **PR #254**, given how
close it sits to the 2026-08-08 "no flat list on /blog" decision. Everything else is a
more straightforward fix; recommend reviewing normally and merging once `checks` is green
(or once confirmed the `main`-branch typecheck break is unrelated and fixed elsewhere).

Next command if you want to check current CI state yourself:
```
gh pr checks 253 254 256 257 259 --repo Am1eza/Iron
```
