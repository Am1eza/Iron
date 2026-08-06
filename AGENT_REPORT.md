# Icon system audit — ahantime.com

**Branch:** `fix/icon-system` · **Draft PR:** https://github.com/Am1eza/Iron/pull/71
**Commits:** `68c8b09` (shared set) · `890c204` (editor set) · `747752e` (rendered sheets)

The owner's complaint — «خیلی چرت و مضخرفه و قشنگ معلومه که هوش مصنوعی درست کرده» — held up.
Two of the defects below (`HeartIcon`, `SparkIcon`) were given as starting evidence; the other
25 came out of the audit.

---

## Method

There is no Node on the host PATH and no SVG rasteriser installed, so I extracted every
exported glyph's path data straight out of the two `.tsx` files with a regex script and
rendered them through the Playwright Chromium already on disk
(`~/.cache/ms-playwright/chromium-1228`, headless `--screenshot`).

Each icon was rendered:

- at **96px** over a 4px sub-grid, the 20×20 live-area box, and the x=12 centre line
  (this is what makes asymmetry and grid drift visible);
- at its **real usage sizes** — 14 / 16 / 18 / 20 / 24 / 28 / 32, whichever it is actually
  called with, found by grepping every call site;
- on **white, on the dark green surface, and on amber**, because the AI mark lands in all three;
- in **both `filled` and outline states** for `HeartIcon`, `BellIcon`, `StarIcon`.

Rendered sheets are committed at `docs/icon-audit/`:

| File | What it shows |
|---|---|
| `before-after-changed.png` | **Start here.** Every changed glyph, before beside after, large + at 24/18/14px |
| `before-full-set.png` | All 77 renderings as they were |
| `after-full-set.png` | All 77 renderings as they are now |
| `real-context-mobile-3x.png` | The built site's header and bottom tab bar at 3× |

Coverage: **69 exported icons + 8 `CategoryGlyph` cases = 77 renderings.** All were looked at.
27 changed. `IBeamGlyph` (48-grid, three lines) was read but is not in the rasteriser output —
it is trivially correct and unchanged.

---

## Changed — geometry defects

These are bugs, not taste.

### `HeartIcon` — asymmetric, confirmed
The two lobes' control points did not mirror each other around x=12, so the right shoulder
carried a visible kink. Obvious in the `filled` state.

```
- M12 20s-7-4.5-9.2-8.4C1.2 8.5 2.6 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.4 0 4.8 3.5 3.2 6.6C19 15.5 12 20 12 20z
+ M12 20.3C12 20.3 3 15 3 9.4 3 6.6 5.1 4.5 7.7 4.5c1.9 0 3.5 1.1 4.3 2.7.8-1.6 2.4-2.7 4.3-2.7 2.6 0 4.7 2.1 4.7 4.9 0 5.6-9 10.9-9 10.9z
```

Every control point on the right is now the exact mirror of its partner (`7.7↔16.3`,
`5.1↔18.9`, `3↔21`). Verified at 18px — its real size in `PriceTable`, `SkuDetail` and
`account/[[...tab]]` — in both states.

### `CartIcon`
A single path drew handle and basket together and never closed the basket's top-left
corner; the left side was vertical and the right slanted, so the cart looked tilted, and
the wheels (x=9, x=17) were not centred under a basket spanning ~6–20. Split into a handle
subpath and a closed, symmetric basket; wheels re-centred at 10.6 / 16.4.

### `HomeIcon`
The roof line passed through y=9.5 at x=6, but the walls started at (6,10) — a 0.5 notch at
both eaves. Rebuilt as one closed pentagon, and given a door, because at 22px in the bottom
tab bar a bare outline is doing all the work.

### `PrintIcon`
The output tray (`y 15→21`) overlapped the chassis (`y 11→18`). With `fill="none"` the
overlapping edges are both drawn, which is why it read as two stacked pills rather than a
printer. The chassis' bottom edge is now interrupted exactly where the tray meets it.

### `BellIcon`
`M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z` — the right shoulder used a straight `2 6` while
the left used `s2-1 2-6`, and the rim ran to unequal x. Harmless-looking outlined, a lopsided
lump once `filled` (which is the state the alert bell uses). Redrawn symmetric.

### `OfflineIcon`
The slash ran `M3 3l18 18`, corner to corner, while the arcs only occupy `x 5–19, y 9.5–19.5`
— so both ends dangled in empty space. Trimmed to `M6.5 9 17.5 20`, centred on the arcs.

### `BankIcon`
Columns at 5 / 10 / 14 / 19 — gaps of 5, 4, 5. Evened to 5 / 9.7 / 14.3 / 19 and given a
plinth line.

### `ChartBarIcon` (editor)
Both bars ended at y=17 with the axis at y=20. They floated three units above the baseline —
a bar chart whose bars do not touch the axis. Now seated on it.

### `SubheadingIcon` (editor)
`M18 14v3` floated a bare tick beside the H, reading as "H." rather than "H₂". Now a real
subscript 2, reusing the digit `OrderedListIcon` already draws so the two match.

---

## Changed — generic, cliché or unclear

### `SparkIcon` → `AiMarkIcon` — the headline change

The old glyph was the four-point sparkle: the single most reused "AI" mark in software,
shipped near-identically by most AI chat products. Geometrically fine, brand-wise it is
stock, and it was carrying the AI feature across 9 files.

**What I replaced it with, and why.** Not another AI cliché (no robot head, no lightbulb, no
different sparkle). Two things about this product decided it:

1. The site's own slogan is «اول مشورت، بعد خرید» — *first consult, then buy*. The AI **is**
   the consultation. The bottom tab bar even labels it «آهن‌تایم», i.e. the advisor is the
   brand.
2. The logo (`public/brand/ahantime-logo.png`) is an **A inside a ring whose stem is an I-beam
   cross-section**, and `iconography.md` §4 already names that I-beam the shared brand motif.

So: **a consult bubble with the I-beam knocked out of it.** The steel section is the thing
speaking. It cannot be mistaken for stock because the interior is this company's own mark.

It is **filled** rather than monoline, deliberately and against the set's usual rule — the
same exception `PauseIcon`/`PlayIcon` already take. It renders at **14px** inside
`AdvisorChat` message rows and at 24px inside the bottom bar's orb; I rendered outlined
versions (`ai-B`, `ai-B2`) and they close to mush below ~18px. `fillRule="evenodd"` makes the
beam a hole, so the mark inherits `currentColor` and works on white, on the dark green
header, and on the amber orb without a second colour.

Four other candidates were drawn and rejected: a broken ring + I-beam (collapses to a blob at
14px, and reads too close to `InfoIcon`), the logo's Λ over a beam (reads as the letter "Å"),
a filled disc with the beam knocked out (loses the "consult" meaning, reads as a generic
badge), and the outlined bubble.

**Renamed** rather than left as `SparkIcon`, since it is not a spark. All 9 call sites
updated (`about`, `HeroSearch`, `ValueProps`, `BottomTabBar`, `Header`, `EmptyState`,
`AdvisorChat`, `ProjectEstimator`, `ArrivalPopup`). The `IconProps` signature is unchanged,
so nothing else about the call sites moved. Typecheck confirms no reference was missed, and
the old path string is gone from `.next` entirely.

### `TagIcon`
`M3 12l9-9 9 9-9 9z` is a rhombus, not a tag — no corner cut, no perspective, and the "hole"
dot sat off-centre at (9,9). This is the **«قیمت‌ها» icon in the mobile bottom tab bar**,
where the glyph carries most of the meaning. Redrawn as an actual price tag with a rounded
head, an angled point and a centred eyelet.

### `WhatsappIcon`
The handset was six 0.7-unit strokes; below 20px it was mud. Redrawn as one closed receiver.
Two alternates were rendered before picking this one.

### `QuoteIcon` (editor)
Rendered as the digits **"55"** — two open hooked squares with tails. Replaced with what a
blockquote actually looks like on the page: a rule with indented lines beside it. Self-
describing, and consistent with how the list and table glyphs in this file already work.

### `BulletListIcon` / `OrderedListIcon` / `QuoteIcon` — RTL orientation (editor)
All three drew markers on the **left** with lines ragged on the right. This editor produces
Persian; that is a picture of text it never generates. Markers moved to the inline-start (the
right). They are deliberately **not** flagged `.icon--rtl` — that utility flips icons whose
meaning is reading-direction-dependent, but the entire editor is RTL, so these are simply
drawn RTL.

### `RowPlusIcon` / `RowMinusIcon` / `ColumnPlusIcon` / `ColumnMinusIcon` (editor)
A lone rounded pill beside a plus — it read as a battery. All four now say the same sentence:
here is the table, here is the row or column being added or removed. Columns grow toward the
inline-start, which is where a new column actually lands in Persian.

---

## Changed — category glyphs

These are the "signature" brand assets per `iconography.md` §4 and they represent real steel
products, so technical accuracy matters more here than anywhere else. They render at **32px**
in `CategoryGrid`. Six of seven were wrong.

| Glyph | Before | After |
|---|---|---|
| `cat-rebar` | A bare line at x=8 with three ticks hanging off one side; the right half of the box empty, so it read as "Ƒ" | A centred round-ended bar with rib ticks crossing it — a ribbed rod (آجدار) |
| `cat-cold-sheet` | Two unconnected ellipses of different sizes plus two stray lines; read as a keyhole / "Ø" | A coil with a **spiral end face**. The spiral is what distinguishes a coil from a pipe — the spec asks for exactly this |
| `cat-pipe` | An ellipse and a body, no bore — a solid bar | Cylinder with an elliptical **bore** (annulus end) |
| `cat-profile` | Square inside a square; read as a generic frame or a stop icon | The isometric **hollow square tube with an open end** the spec calls for |
| `cat-hot-sheet` | A slanted plate plus `M7 12v3l13-3`, a line that floated off the plate | Symmetric isometric plate with visible thickness |
| `cat-angle-channel` | Only the angle, and its two paths overlapped into one flat L | The **L-angle beside the U-channel**, both with wall thickness so they read as rolled sections rather than as letters |
| `cat-ibeam` | — | **Kept.** It already reproduces the logo mark exactly as the spec intends |

---

## Reviewed and kept as-is

Rendered at 96px on the grid and at usage size; geometry checked, symmetry verified
numerically where it matters. No change needed:

**Navigation / system** — `MenuIcon`, `CloseIcon`, `SearchIcon`, `UserIcon`,
`ChevronDownIcon`, `ChevronStartIcon`, `ChevronEndIcon`, `ArrowEndIcon`, `FilterIcon`,
`SortIcon` (both arrows verified mirrored at x=7/x=17), `MoreIcon`, `ExternalIcon`, `HomeIcon`
(geometry fixed, concept kept).

**Actions / data** — `DownloadIcon`, `SheetIcon`, `ImageIcon`, `ChartIcon`, `ShareIcon`,
`PlusIcon`, `MinusIcon`, `TrashIcon`, `EditIcon`, `CopyIcon`, `RefreshIcon`, `CheckIcon`,
`PauseIcon`, `PlayIcon`.

**`StarIcon`** — I checked this one numerically because it looked slightly uneven at 96px.
It is not: every vertex mirrors around x=12 (14.6↔9.4, 20.5↔3.5, 16.2↔7.8, 17.2↔6.8). Kept.

**Status / feedback** — `CheckCircleIcon`, `InfoIcon`, `WarningIcon` (apex at 12, base
2.5–21.5, symmetric), `CalendarIcon`, `ClockIcon`.

**Channels / contact** — `PhoneIcon`, `TelegramIcon` (the paper plane reads cleanly at size),
`MicIcon`, `GlobeIcon`.

**Other** — `ShieldIcon`, `SunIcon` (all eight rays verified symmetric), `MoonIcon`,
`IBeamGlyph`, `cat-default`.

**Editor** — `BoldIcon`, `ItalicIcon`, `HeadingIcon`, `LinkIcon`, `TableIcon`,
`ChartLineIcon`, `PictureIcon`, `RuleIcon`, `UndoIcon`/`RedoIcon` (verified mirrored),
`HeaderRowIcon`.

No third-party icon library was introduced. Everything stays hand-drawn on the documented
24-grid / 1.75-stroke / `currentColor` contract, per the existing file comments.

---

## Review pass (a) — visual / design

Full before and after contact sheets rendered side by side (`docs/icon-audit/`).

The set now reads as one hand. Specifically: no icon is lopsided about its own axis any more;
no two strokes cross where they should meet; the category glyphs share one isometric
projection and one lighting direction, so they look like plates from an engineering catalogue
rather than seven unrelated drawings; and the editor glyphs all depict Persian text.

The single biggest change to the "AI-generated" impression is the advisor mark — the sparkle
was the one glyph a viewer could name from another product. What is there now is the
company's own I-beam.

Remaining judgement calls I did **not** act on, flagged rather than silently changed:

- **`BankIcon` is used for «انبار من» (my warehouse)** in `account/[[...tab]]` and for the
  warehouse card, but `iconography.md` §5.4 defines it as the bourse/exchange glyph. A
  columned institution is not a warehouse. This is a *usage* mismatch, and fixing it means
  adding a `WarehouseIcon` and changing what those screens show — outside "fix the icons",
  so it is a separate call for the owner.
- `RuleIcon` and `HeaderRowIcon` are the only two glyphs using `opacity`, which sits oddly
  against §10's "don't mix filled + line randomly". Both read correctly, so I left them.

## Review pass (b) — technical

- **API unchanged.** `AiMarkIcon` takes the same `IconProps` the old `SparkIcon` did. The
  `filled?: boolean` prop on `HeartIcon`, `BellIcon` and `StarIcon` is untouched — only path
  data changed inside them. No call site needed anything but the rename.
- **Rename fully propagated.** `grep -rn SparkIcon web/src` → 0 hits; 22 `AiMarkIcon` hits
  across the 9 files plus the definition. (`Button.tsx`'s `'spark'` CSS class is an unrelated
  ripple animation and was left alone.)
- **No snapshot tests exist** for any changed component (`find src -name '*.snap'` → empty),
  so nothing was blindly re-accepted.
- **Built output verified**: the new advisor-mark and heart paths are present in
  `.next/server`; the old spark path string appears **0** times anywhere in `.next`.
- **Real rendered context**: I served the prerendered pages out of `.next/server/app` with
  their real CSS and screenshotted them at 3×. The bottom tab bar's orb, the desktop header's
  «مشاور هوشمند» pill (16px), and the tag / cart / home / user tabs all render correctly —
  see `docs/icon-audit/real-context-mobile-3x.png`.

### Gates (all via Docker, `node:20`, per CLAUDE.md §4)

| Gate | Result |
|---|---|
| `tsc --noEmit` | **clean** |
| `next lint` | **clean** — warnings only, all pre-existing, none in changed files |
| `stylelint 'src/**/*.css'` | **clean** |
| `vitest run` | **103 files, 1082/1082 passed** |
| `next build` | **succeeded** |

E2E/axe was not run: per CLAUDE.md §5 `CI / e2e` is known-red independently of any change,
and it needs a live app + database this worktree does not have.

> Note: `web/node_modules` and `web/next-env.d.ts` are absent from a fresh worktree (both
> gitignored). I symlinked the former from `/opt/ahantime/web` and copied the latter to get
> the toolchain running; neither is tracked, and `git status` is clean apart from the commits.

---

## Not done / out of scope

- No visual-regression harness was added to the repo. The rasteriser used here is a throwaway
  script in the job's tmp dir; if the owner wants this repeatable, a small Playwright spec
  that snapshots the icon sheet would be the natural follow-up.
- The `BankIcon`-as-warehouse mismatch above.
- Nothing was deployed or merged. The PR is a **draft**.
