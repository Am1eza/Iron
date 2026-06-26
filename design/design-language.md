# Fooladno — Design Language
## Layer 3 · UI / Design System — Document 1 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `brand/brand-book.md`, all of Layer 2.
**Purpose:** Define the **soul of the interface** — the philosophy, principles, signature elements, and explicit anti-patterns that make Fooladno look *intentional, premium, and unmistakably crafted* — never like a generic AI/SaaS template. This document governs the tokens and components that follow.

> **Mandate:** minimal, striking, and it must **not read as AI-designed**. We achieve that not by adding more, but by being *opinionated* — an ownable point of view that a template cannot fake.

---

## 1. The Big Idea — «آرامش مهندسی‌شده» / *Engineered Calm*

Steel is precise, strong, and quiet. Our interface is the same: **the calm confidence of precision engineering.** Not loud, not decorative, not "friendly-startup." It feels measured, exact, and trustworthy — like a well-made instrument. Every element earns its place; the result is silence around the things that matter (the **price**, the **advice**, the **decision**).

This idea is carried by a three-part material metaphor drawn from making steel — which also maps 1:1 to our brand colors *and* to function:

| Element | Role | Brand color | In the UI |
|---|---|---|---|
| **Graphite — «بدنه» (the body)** | the calm structural canvas | Ink/Graphite | surfaces, structure, type, the quiet 90% |
| **Cobalt — «ذهن» (the mind)** | intelligence & interaction | Cobalt | the AI, links, focus, live/interactive things |
| **Molten Amber — «جرقه» (the spark)** | heat at the point of value | Amber | the *one* primary action, a price moving, the AI spark |

**Learnable logic for the user:** *graphite = structure · cobalt = smart/interactive · amber = act/value.* Used with discipline, this triad becomes a recognizable signature.

---

## 2. Design Principles (opinionated — each with a do / don't)

**P1 · Structure over decoration.** Layout is built on an honest, visible grid — like an engineering drawing. Alignment and rhythm do the work that ornament does in lesser designs.
- *Do:* expose structure; align everything to the grid; use generous, deliberate margins.
- *Don't:* add gradients, blobs, or "visual interest" to fill space. Space *is* the interest.

**P2 · Lines, not boxes.** We separate and group with **precise 1px hairlines** (the drafting metaphor), not stacks of drop-shadowed floating cards.
- *Do:* hairline dividers, table rules, thin keylines.
- *Don't:* shadow-on-everything, glassmorphism, heavy elevated cards.

**P3 · Data is the hero.** The price table and the number are the most beautiful objects on the screen — typeset like a precision datasheet/financial terminal.
- *Do:* large confident tabular numerals; true column alignment; نوسان as the only color in a sea of ink.
- *Don't:* decorate data; bury the number under chrome.

**P4 · One accent, one action.** Each view has a **single** amber moment (the primary action / the value) and cobalt for the interactive/intelligent. Restraint is the premium signal.
- *Do:* one primary CTA per view; color only where it means something.
- *Don't:* rainbow buttons, color used for "prettiness."

**P5 · Type-led hierarchy.** Importance is expressed through **size, weight, and space** — not boxes, badges, or color.
- *Do:* a tight, deliberate type scale; let whitespace rank things.
- *Don't:* outline/fill/color a thing just to make it "pop."

**P6 · Honest material.** Surfaces are flat and true, like brushed steel or technical paper. No fake depth, no skeuomorphic gloss, no decorative 3D.
- *Do:* matte surfaces, crisp edges, a single soft light source if any.
- *Don't:* bevels, glows, glass, neon.

**P7 · Persian-first craft.** The Persian typography and RTL composition are the *primary* design, executed with real typographic care — not a translated afterthought. This alone separates us from every Western AI template.

**P8 · Calm motion.** Movement is precise and weighted, like machinery settling — never bouncy or playful. Motion clarifies; it never performs.

---

## 3. The Anti-"AI-Design" Manifesto (what we will NOT do)

These are the tells of generic AI/template design. **Banned:**

- ❌ **Purple/indigo gradients** and "aurora"/blurred-blob backgrounds.
- ❌ **Glassmorphism** (frosted translucent panels) used as a style.
- ❌ The **"three centered feature cards with an icon on top"** hero template.
- ❌ **Emoji as UI icons**; cartoon AI mascots; the generic purple "AI sparkle" everywhere.
- ❌ **Over-rounded everything** (pill/blob radii of 16–24px on every box).
- ❌ **Drop shadows on every element**; floating-card soup.
- ❌ **Stock 3D illustrations** of people/robots; generic isometric art.
- ❌ **Default framework look** (untouched shadcn/Tailwind/Bootstrap defaults; centered max-w containers with nothing custom).
- ❌ **Decorative fake charts/dashboards** as filler.
- ❌ **Inconsistent spacing** and arbitrary one-off styles.
- ❌ **Color as decoration** with no semantic meaning.

**Instead, we do:** a visible structural grid · 1px hairlines · matte graphite surfaces · a disciplined mono-accent · type-led hierarchy · tabular-numeral datasheets · small precise radii (≈6px) · custom line-icons · weighted, mechanical motion · and beautiful Persian typography. *Distinctiveness is the proof of human intent.*

---

## 4. Visual Language Pillars

### 4.1 Space & layout
- **Exposed grid / blueprint discipline:** a 12-column grid with generous, *asymmetric* composition where it earns attention (the AI hero off the dead-center; the data given room). Avoid the "everything centered in a 1200px box" template feel.
- **Two density modes:** **Story density** (marketing/home/trust — airy, large type, lots of graphite and space) vs **Data density** (tables/admin — compact, exact, scannable). The shift between them is intentional and part of the rhythm.
- **Margins as a feature:** wide, consistent gutters; content never crammed edge-to-edge.

### 4.2 Line & edge (the drafting system)
- **1px hairlines** (`Hairline #E5E9F0` on light; a darker keyline on graphite) are the primary separators — table rules, section keylines, input borders.
- **Small, honest radii** (≈4–8px) — steel sections have crisp edges; we are not a bubbly consumer toy.
- **No shadows by default.** Elevation (modals, menus) uses a *single, very soft* shadow only when something truly floats — never as decoration (see 4.5).

### 4.3 Color behavior
- **Graphite-and-paper rhythm:** brand/story surfaces lean **graphite/dark** (architectural, premium); data/price surfaces are **clean white "paper"** for maximum legibility. The alternation is a signature.
- **Mono-accent rule:** one accent leads a view. **Cobalt** = interactive/intelligent (AI, links, focus, live). **Amber** = the single primary action and the *value* (price emphasis, "fresh price" pulse). 
- **Data color is sacred:** green/red appear **only** in نوسان/ticker — so when the user sees color in a table, it always means price direction. Never decorative.
- **70/20/10:** ~70% neutral & space, ~20% graphite ink, ~10% accent.

### 4.4 Typography
- **Persian-first, type-led.** Headlines in **Estedad** with confident weight and tight, optical spacing; body legible and calm; **the price number is the typographic hero** — large, tabular Persian digits, set like a financial display.
- **Datasheet numerals:** all tabular data uses monospaced/tabular figures and true decimal alignment (Vazirmatn). Numbers feel *engineered*.
- **Hierarchy via scale + space**, not decoration (P5).

### 4.5 Depth & elevation
- **Flat + hairline + (rarely) one soft shadow.** Layer order is shown by hairlines and surface tone, not stacked shadows. Modals/menus get **one** soft, low, neutral shadow — calm, not floaty. **No glassmorphism, ever.**

### 4.6 Motion — «حرکتِ مهندسی‌شده»
- **Character:** precise, weighted, *mechanical calm.* Eased like machinery settling (custom ease, ~150–250ms), never spring/bounce.
- **Signature micro-interactions:**
  - **The Spark** — at the moment of value/action, a brief **amber** glow/pulse (a fresh price publishes; the primary CTA presses; the AI begins). Heat = something happened.
  - **Cobalt focus** — interactive elements wake with a crisp cobalt focus/hover, reinforcing "smart = cobalt."
  - **Rail flip** — the category name → image crossfade (200ms), our signature nav moment.
  - **Streaming** — the AI types with a calm cursor; no gimmicky typing animation.
- **Restraint:** respect `prefers-reduced-motion` (instant/static); motion never blocks reading.

### 4.7 Imagery, texture & icons
- **Steel as material, not illustration:** photography is high-contrast, cool-lit, lots of negative space — close, honest shots of sections/coils/edges; never cheesy stock or 3D render. Often duotone-graphite to sit inside the system.
- **Custom line-icon family:** 1.75px stroke, geometric, single-color, drawn as one set — including the **product-category icons** (the rail's hover images) which are core brand assets. No emoji, no generic icon packs untouched.
- **The I-beam motif:** the logo's I-beam recurs subtly as a *structural device* — section markers, a spacer, an empty-state glyph — never loud, always meaningful.
- **Texture:** essentially none — matte. The only "texture" is the precise hairline grid (the drafting paper).

### 4.8 Light
- A single, soft, neutral light implied from one direction (subtle, for the rare elevated surface). No multi-glow, no neon, no colored light.

---

## 5. Signature Elements (the ownable details)
What makes a Fooladno screen recognizable at a glance — and impossible to mistake for a template:
1. **The Datasheet table** — hairline-ruled, tabular Persian numerals, نوسان as the lone color, زمان تحویل as a quiet badge. Beautiful, terminal-grade data.
2. **The fixed category rail** with the **name→image flip** — our signature navigation gesture.
3. **The Spark** — amber heat at the single point of value/action per view.
4. **Graphite-and-paper rhythm** — dark story surfaces, white data surfaces, alternating with intent.
5. **The I-beam structural motif** as dividers/markers/empty-states.
6. **Cobalt = intelligence** — the AI and all live/interactive things share one learnable accent.
7. **Confident Persian price typography** — the number as hero.

---

## 6. Tone Made Visual (brand personality → UI)
| Brand trait | How it looks |
|---|---|
| **دانا / knowledgeable** | datasheet precision; standards & specs presented cleanly; the AI's structured answers |
| **شفاف / transparent** | visible last-updated stamps, «قیمت ما vs قیمت پایه», honest empty/stale states |
| **سریع / fast** | instant data, minimal chrome, no loading theatrics, snappy weighted motion |
| **همراه / warm** | the AI's calm Persian voice; human, plain language; never cold or robotic copy |
| **هوشمند / smart** | cobalt cues; the AI woven in, not bolted on |

---

## 7. Dual-Mode Aesthetic (one language, two voices)
- **Guided lane (AI / Builder):** more **graphite, spacious, conversational**; cobalt-led; calm and reassuring — for someone who needs help.
- **Fast lane (tables / Pro):** more **paper-white, dense, exact**; the datasheet; minimal words — for someone who needs speed.
- **Unified by:** the same grid, hairlines, type, motion, and the graphite/cobalt/amber triad. Two feels, one unmistakable language.

---

## 8. RTL & Persian as Design Language
- Persian composition is the *primary* design: right-to-left rhythm, Persian numerals, Estedad's character, correct Persian punctuation and spacing (ZWNJ care).
- Mirroring is exact (directional icons, breadcrumb separators, drawer from the right).
- This Persian-native craft is, by itself, a powerful differentiator from any imported AI template.

---

## 9. How We Look Unlike Everyone Else
- **Unlike Iranian competitors** (cluttered, red/orange, banner-heavy, dense ad-like price lists): we are **calm, graphite, spacious, data-elegant** — premium where they are busy.
- **Unlike generic AI/SaaS templates** (purple gradients, glass cards, centered feature trios): we are **structural, hairline-precise, mono-accent, Persian-crafted, steel-souled** — opinionated where they are default.
- The space *between* those two is empty — and it is ours.

---

## 10. The Litmus Test («تست حس») — judging any screen
A screen is **on-language** only if:
- [ ] It would look intentional with the color removed (structure + type carry it).
- [ ] There is exactly **one** amber moment (the action/value) and cobalt only on smart/interactive things.
- [ ] Separation is mostly **hairlines**, not shadows; no glassmorphism; radii are small.
- [ ] The **number/price** is the most confident element where data is present.
- [ ] Nothing on the **anti-pattern list (§3)** appears.
- [ ] Persian typography and RTL feel native and cared-for.
- [ ] Removing any element would lose meaning (nothing decorative).

> If a screen could be any SaaS startup, it fails. If it could only be **Fooladno**, it passes.

---

## 11. Bridge to the next documents
This language sets the constraints for:
- **Design Tokens / Foundations** (next) — exact color/type/space/radius/shadow/motion values realizing §4.
- **Component Library** — buttons, the Datasheet table, ticker, AI hero, rail, inputs, modals, پیش‌فاکتور, admin grid — each obeying these principles and signatures.
- **Screen designs** — high-fidelity application of the language to every Layer-2 wireframe.

*Recommended immediate proof step:* a hand-built **HTML/CSS style tile** (live, in-browser) demonstrating the graphite/cobalt/amber triad, the hairline datasheet, the Persian price typography, and the Spark — to validate the look before tokens/components.

*Fooladno — اول مشورت، بعد خرید.*
