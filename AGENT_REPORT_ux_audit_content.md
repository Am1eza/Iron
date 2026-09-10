# UX audit — content, homepage, blog, and search (ux-audit-content)

Scope: items #1–#5 of the "content, homepage, and search UX issues" brief. Continued
locally on `/Users/amirreza/Iron-ux-audit-content` (branch `ux-audit-content` → 5 topic
branches) after the original in-progress job on the production VPS was killed by an
overload-triggered reboot. Item #1 was mid-edit when picked back up; items #2–#5 were
untouched and built from scratch.

**Note on "live evidence":** the brief originally asked for live verification against
https://ahantime.com with real screenshots. Browser automation in this session required
an interactive account-selection prompt (`AskUserQuestion`) that would block indefinitely
in a detached background job with no one watching in real time — using it would have
stalled the whole run. I skipped it and verified everything by reading the actual current
source (not by trusting the brief's or the audit's claims), cross-checking git history for
staleness, and running the real test/type/lint pipeline locally. Where a claim in the
brief didn't match what the code actually does, I say so below rather than silently
building on a possibly-stale premise. CI's own e2e suite (Playwright + axe-core) is the
closest thing to live verification these PRs have had so far — see per-PR CI status.

---

## PR #253 — feat(US-audit.1): homepage hero CTAs + Category Stage compression
Branch `ux-audit-content` → https://github.com/Am1eza/Iron/pull/253

**Hero CTAs (finished from WIP).** The advisor input, its send button and three starter
chips were one undifferentiated block with no clear primary action. Reviewed the
in-progress diff critically — it was structurally sound (correct tokens, correct routes,
correct icon) but had a badly over-long comment block (multi-paragraph, against this
codebase's style) which I trimmed to one line, and a stale top-of-file docblock still
describing the pre-change layout, which I updated to match. Final state: a primary
"مشاهده قیمت‌ها" CTA (browse) and a secondary "محاسبه پروژه با مشاور" CTA (advisor),
matching the existing primary/secondary button hierarchy; the AI search box demoted to a
labelled inline shortcut below them. Locale strings added for ar/en/fa/zh (pre-existing
work, verified correct).

**Category Stage compression.** Read `CategoryStage.tsx` in full: clicking a category
name was *already* a direct, one-click `<Link>` to that category's price table — the
hover-reveal flyout is supplementary navigation, not a gate in front of the real path. So
"shorten the path" had nothing to shorten; the actual complaint (~520px tall panel) is
about visual weight, not click count. Trimmed the panel's decorative photo (`aria-hidden`,
`object-fit: cover`) from 240px to 176px block-size and the section's vertical padding
from `--space-20` (80px) to `--space-16` (64px) — brings the flyout's `min-block-size`
down from 520px to 440px without removing any information (sub-categories, mill list, and
the CTA are all still there, just less padding around them).

**Trust/logo carousel — reviewed, not changed.** The audit's claim ("inconsistent aspect
ratios, cropped at carousel edges") doesn't match the current code. `Partners.tsx` /
`Marquee.tsx` already have: fixed 220×96 logo cells with `object-fit: contain` (the
in-code comment explicitly documents this was done to fix a CLS regression, which
necessarily also fixed aspect-ratio inconsistency as a side effect), an edge-fade overlay
whose color is set via a `--marquee-fade` custom property matching the panel's actual
background (`var(--steel-900)`, the same value `.blueprint`'s `background-color` resolves
to), and a seamless 3-copy-track loop with hover/focus pause. `git log` shows this landed
in commit `aeb236e` on 2026-07-27 — about four weeks before this audit ran. My reading:
this is very likely a stale audit finding (the audit possibly ran against a cached/older
deploy, or re-described a problem that was already fixed). I did not touch it — changing
already-correct, already-documented code on a guess would be worse than leaving it. Flagged
explicitly in the PR description for the owner to double-check against the live site.

**CI:** e2e pass. `checks` (typecheck) fails — but see "Known pre-existing CI break" below;
confirmed not caused by this PR.

---

## PR #254 — feat(US-audit.2): blog homepage featured-articles preview
Branch `ux-audit-blog-featured` → https://github.com/Am1eza/Iron/pull/254

Verified live claim against the actual route component (`ArticleIndex.tsx`, shared by
`/blog` and `/news`): for `type === 'blog'`, the flat article list render branch is
unconditionally skipped — only the category rail renders below the lede, so `/blog` really
does show zero article content on first paint until a reader picks a category.

**Found a real tension worth flagging rather than silently overriding:** the exact code
path that suppresses the list carries a comment citing an explicit, dated product decision
— "dropped per Amir/Kamyar's explicit request (2026-08-08)... that space is earmarked for
a videos/podcast section later." That's 16 days before this audit ran, from the person
this whole task is running for.

Rather than either (a) blindly reinstating the flat list, which would directly contradict
a very recent named decision, or (b) skipping the fix entirely, which would leave the
audit's real, current finding unaddressed, I implemented something narrower: a capped
preview (≤4 cards, using the article list *already fetched* by the page — no new query)
positioned **above** the category rail rather than in the specific space (below the rail)
the decision reserved for video/podcast content later. It's differently scoped (a
preview strip vs. a full paginated archive) and differently placed, so I don't believe it
contradicts the letter of the 2026-08-08 decision — but it's close enough to that decision
that I flagged it prominently in the PR description and am flagging it here too. **This is
the one PR in this batch where I'd most want an explicit owner sign-off before merge.**

Skipped "پربازدیدترین" (most-viewed) entirely, per the brief's own permission to skip it:
confirmed via the schema (`content.ts`) and a repo-wide grep that no view-count column or
analytics table tracks per-article views. Inventing one would have been fabricating a
metric.

**CI:** e2e pass. `checks` fails — pre-existing, see below.

---

## PR #256 — feat(US-audit.3): read-time badge on article cards
Branch `ux-audit-article-cards` → https://github.com/Am1eza/Iron/pull/256

Read `ArticleCard.tsx` before touching anything: it already renders `article.coverUrl`
when the DB row has one, on both `/blog` and `/blog/category/[slug]` (both routes use the
same `ArticleCard`). So "add a hero image where a real one exists" was already done —
no change made there, and I said so in the PR rather than claiming credit for it.

What was actually missing was a read-time estimate. No reading-time utility existed
anywhere in `lib/utils/`, so I wrote one (`lib/utils/readingTime.ts`, unit-tested). The
harder decision was where the word count comes from: `articlesRepo.ts`'s list queries were
deliberately trimmed to skinny, no-body rows by an earlier perf fix (documented in a
comment on `LIST_COLUMNS` — fetching full article bodies to render title-only cards was
shipping megabytes per call). Re-fetching the body in Node to count words would have
undone that fix. Instead the word count is computed **inside Postgres**
(`regexp_split_to_array` over `body_md`, `coalesce`d to 0) and only the resulting integer
crosses the wire — verified this doesn't reintroduce the original problem, and verified
the SQL expression actually works against the pglite test DB (all three `articlesRepo`
pg-backed test files re-run and pass).

No author field added: the schema has `authorId` (an internal FK, no public name/bio), and
the brief said explicitly not to fabricate one.

**CI:** e2e pass. `checks` fails — pre-existing, see below.

---

## PR #257 — feat(US-audit.4): collapse article TOC, add reading progress
Branch `ux-audit-toc` → https://github.com/Am1eza/Iron/pull/257

Read `TableOfContents.tsx` and its test file before changing anything — confirmed the
audit's claim directly: it rendered every H2 *and* H3 heading, always expanded, gated only
on "≥3 headings total." A 25-heading article really would dump 25 links above the fold.

Restructured to group by H2, with H3 children collapsed under a native
`<details>/<summary>` disclosure per group (closed by default) — deliberately reused the
exact same accordion pattern `ArticleFaq.tsx` already uses elsewhere in this codebase,
including its documented reasoning for keeping the summary's content non-interactive (a
plain heading, never a link) to avoid the nested-interactive-control pattern `axe` flags.
Jump links sit as siblings of the `<summary>`, not nested inside it. Still a pure Server
Component — no client JS needed for the collapse. Top-level list capped at 8 entries, with
any remainder behind one more "N مورد دیگر" disclosure, same mechanism. Rewrote the
component's test file for the new behavior (and proved the collapse is real, not just
present-in-DOM-but-still-visible, by asserting on the `<details>` `open` attribute the way
`ArticleFaq.test.tsx` already does).

Added a small `ReadingProgress` client component (fixed 3px bar, scroll-position fill,
writes to a DOM ref directly rather than React state per scroll tick, rAF-throttled) and
wired it into both `/blog/[slug]` and `/news/[slug]` — they already share
`TableOfContents`, so both pages had the same TOC problem and now both get the same
progress indicator.

**CI:** e2e pass. `checks` fails — pre-existing, see below.

---

## PR #259 — feat(US-audit.5): search ranking, result-type filters, autocomplete
Branch `ux-audit-search` → https://github.com/Am1eza/Iron/pull/259

All three sub-items from the brief were attempted; here's what changed and why for each.

**Ranking.** Read `catalogRepo.ts`'s `searchSkus` in full: ordering was pure
`similarity(sku.name, query) DESC`, no tie-break at all. Tried to actually reproduce the
brief's stated example ("میلگرد ۱۴" → niche steel variant outranking the common ribbed
variant) with a throwaway pg_trgm probe script against several plausible SKU-name
compositions; most of my attempts had the common variant already winning on raw
similarity, which suggests the literal example may not reproduce with today's real catalog
data (or depends on exact factory-name/suffix wording I don't have). But I did find a
**genuine, measured exact tie** between two representative SKU names against a natural
query, which is exactly the condition the brief describes ("matches multiple sub-categories
equally on text relevance") — so the underlying bug (no tie-break at all) is real regardless
of whether the specific quoted example reproduces verbatim.

Fix: `searchSkus` now orders by (1) `round(similarity(...)::numeric, 2)` — buckets
near-ties a raw float sort never groups, (2) `subCategories.order` ascending — the
**existing** admin-set popularity/display column the taxonomy rail already sorts by, not a
new field, per the brief's own steer — and (3) raw similarity as a final tie-break. Proved
this isn't a coincidence: wrote a pglite-backed test with two SKU names verified (by the
same probe script) to have the *exact same* similarity score against the test query, then
manually swapped the two sub-categories' `order` values and watched the test fail (the
ranking flipped), then reverted — this is a genuine dependency on the new code, not an
artifact of insertion order or table scan order.

**Result-type filters.** `searchAll` already returns distinguishable `skus`/`categories`/
`articles` arrays (confirmed by reading `catalog.ts` and the `/search` page) — it just never
exposed a way to narrow to one. Added `?type=sku|category|article` filter chips above the
results, entirely server-rendered (no client JS), preserving `q`.

**Autocomplete — attempted, not deferred.** The brief expected this to need "a debounced
client query + possibly a new lightweight endpoint," and told me to only attempt it if the
first two were done and there was clearly enough remaining scope. Before deciding, I
checked what already existed: `GET /api/search` was already there, already rate-limited,
already the exact `{skus, articles}` shape the /search page itself consumes. That
materially changes the cost/risk calculus versus what the brief anticipated, so I built the
client side: a suggestions dropdown on `SearchBar` (shared by the header and the /search
page), reusing the exact debounce + `useQuery` idiom the existing admin `CommandPalette`
already uses (same codebase convention, not invented fresh), a new `catalogApi.search()`
resource wrapper, and an ARIA combobox pattern (input keeps real DOM focus,
`aria-activedescendant` marks the virtual selection, Enter with nothing highlighted still
falls through to the plain "submit to /search" path so a slow network or a query error can
never block the baseline search flow). Mock/dev mode intentionally returns no suggestions
rather than re-implementing /search's own mock-mode substring scan client-side — documented
in the resource function's comment; the real /search page's mock behavior is completely
unaffected.

**CI:** e2e was still `pending` at the time this report was written (PR opened last); `checks`
was also still pending. Re-check before merge.

---

## Known pre-existing CI break (not caused by this work)

Every one of the 5 PRs above shows `checks` (the CI job that runs `pnpm typecheck`) as
failing. I verified this is **not** something any of these branches introduced:

- Locally, `tsc --noEmit` on every branch in this batch shows exactly one error, always in
  the same unrelated file: `scripts/repairSeedPrices.ts(178,3)` — a `SeedRow` type missing
  a `grade` property. None of my diffs touch that file.
- Confirmed the same error is what fails CI's `Typecheck` step (pulled the actual failed-step
  log from PR #253's run).
- Confirmed via `gh run list --branch main` that **`CI` is currently failing on `main`
  itself** (commit `085cb15a`, run created 2026-08-24T08:37:31Z) — independent of any of
  these 5 branches, all of which forked from `main` before that commit landed. This is a
  regression some other concurrent piece of work introduced on `main` after my branches
  diverged.
- `Workers Builds: ahantime` failing on every PR is the secondary Cloudflare target
  CLAUDE.md already documents as red on `main` independent of any PR — expected, not a
  regression.
- `e2e` (Playwright + axe-core) passes on every PR checked so far — this is the suite that
  would actually catch a real regression in what I touched, and it's green.

**Recommendation:** none of these 5 PRs need to fix `scripts/repairSeedPrices.ts` — it's
unrelated to the UX-audit-content scope and touching it would be scope creep into a script
some other in-flight change presumably owns. Whoever fixes it on `main` will very likely
turn `checks` green on these PRs automatically once they're rebased/re-run.

## What was explicitly deferred/skipped, and why

- Trust/logo carousel edge-fade fix (item #1's second half) — reviewed, found already
  fixed by a commit predating this audit by ~4 weeks; no change made, flagged as likely
  stale.
- "پربازدیدترین" (most-viewed articles) section on `/blog` — skipped, no view-count data
  exists in the schema; the brief explicitly permitted skipping this.
- Author name/bio on article cards — skipped, no public author field in the schema; the
  brief explicitly said not to fabricate one.
- `HeroVideo.tsx`'s missing pause control — never touched, per the brief's explicit
  exclusion (owner's prior decision).
- Anything under `/Users/amirreza/Iron` (the sibling `ux-p0-audit` job's directory) —
  never touched, worked exclusively in `/Users/amirreza/Iron-ux-audit-content`.
