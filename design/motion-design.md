# Ahantime — Motion Design
## Layer 3 · UI / Design System — Document 9 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `design-language.md §4.6`, `components.md`, `accessibility.md`.
**Purpose:** The complete motion system — durations, easings, signature motions, per-component specs, reduced-motion fallbacks, performance rules, and CSS tokens. Motion realizes **«حرکت مهندسی‌شده» / Engineered Motion**: weighted, precise, calm — it *clarifies*, never *performs*.

### Principles
1. **Functional only.** Every animation has a job: orient, give feedback, show continuity, or mark value. No decorative motion.
2. **Weighted & mechanical.** Eased like precision machinery settling — **no spring, no bounce, no overshoot, no elastic.**
3. **Calm & quick.** Short (mostly 140–280ms); never blocks reading or delays a tap result.
4. **One emphasis at a time.** Like the mono-accent rule — a view has at most one "look here" motion (usually **the Spark**).
5. **Accessible by default.** Honors `prefers-reduced-motion`; auto-motion is pausable; no motion-only meaning; vestibular-safe (no large zoom/parallax/spin).

---

## 1. Duration Scale (tokens)
| Token | ms | Use |
|---|---|---|
| `--dur-instant` | 0 | reduced-motion / value swaps that must be immediate |
| `--dur-fast` | 140 | micro: hover, button press, toggle, small state |
| `--dur-base` | 200 | **default** transitions, crossfades, menus, toasts |
| `--dur-slow` | 280 | entrances: modal, drawer, bottom sheet, larger moves |
| `--dur-slower` | 400 | chart line draw, page-level (use sparingly) |
| `--dur-spark` | 300 | the Spark pulse |
> Keep within this set. If something needs >400ms, reconsider — it's probably wrong.

## 2. Easing Curves (no bounce, ever)
| Token | cubic-bezier | Character / use |
|---|---|---|
| `--ease-standard` | `(.4, 0, .2, 1)` | default in-out moves (most transitions) |
| `--ease-entrance` | `(0, 0, .2, 1)` | decelerate — things arriving (fade/scale/slide-in) |
| `--ease-exit` | `(.4, 0, 1, 1)` | accelerate — things leaving |
| `--ease-emphasized` | `(.2, 0, 0, 1)` | decisive "settle" — hero/signature moments (modal, drawer) |
| `--ease-linear` | `linear` | continuous loops (ticker marquee, shimmer) |
> **Banned:** `cubic-bezier` with overshoot (control points >1 / <0), spring/elastic, bounce. They read playful/template — wrong for steel.

## 3. Motion Tokens (CSS)
```css
:root{
  --dur-instant:0ms; --dur-fast:140ms; --dur-base:200ms; --dur-slow:280ms;
  --dur-slower:400ms; --dur-spark:300ms;
  --ease-standard:cubic-bezier(.4,0,.2,1);
  --ease-entrance:cubic-bezier(0,0,.2,1);
  --ease-exit:cubic-bezier(.4,0,1,1);
  --ease-emphasized:cubic-bezier(.2,0,0,1);
}
@media (prefers-reduced-motion: reduce){
  :root{ --dur-fast:0ms; --dur-base:0ms; --dur-slow:0ms; --dur-slower:0ms; --dur-spark:0ms; }
}
```

---

## 4. Signature Motions (ownable — use deliberately)

### 4.1 The Spark ✨ (heat at the point of value)
The brand's signature micro-interaction. A brief **amber** pulse fired on: a **fresh-price publish**, a **primary-action press**, the **AI waking/answering start**.
- **Spec:** a radial/ring pulse via a pseudo-element — scale `0.9→1.15`, opacity `.5→0`, `--dur-spark` `--ease-exit`, **once** (no loop).
- **Rule:** at most one Spark per view at a time; never decorative/idle.
- **Reduced-motion:** no animation — replace with an instant, brief static amber emphasis (or nothing).
```css
@keyframes spark{ from{transform:scale(.9);opacity:.5} to{transform:scale(1.15);opacity:0} }
.spark::after{content:"";position:absolute;inset:0;border-radius:inherit;
  box-shadow:0 0 0 2px var(--amber-500);animation:spark var(--dur-spark) var(--ease-exit);}
@media (prefers-reduced-motion:reduce){ .spark::after{animation:none} }
```

### 4.2 Rail name→image flip (signature nav)
Category rail: on hover/focus the name crossfades to its image. **opacity crossfade + image scale `0.96→1`**, `--dur-base` `--ease-standard`. Reduced-motion → instant swap.

### 4.3 Cobalt focus/hover wake
Interactive elements "wake" with cobalt on hover (`--dur-fast` color) and a **crisp instant focus ring** (focus ring appears with **no transition** — clarity over flourish). Teaches *cobalt = interactive*.

### 4.4 Streaming AI text
The AI types token-by-token (server stream) with a **calm 1s steady cursor** (not a flashy blink). Reduced-motion → render the full message at once, no cursor animation. (a11y: announce the final message, not each token.)

### 4.5 Live-price tick
When a price updates live, the cell gets a **brief tint flash** (gain/loss at ~10% alpha) fading out over ~600ms (`--ease-exit`) — the calm financial-terminal "it changed" cue — optionally paired with the Spark on a fresh publish. Reduced-motion → value changes instantly with a static color hold (no fade).

### 4.6 Ticker marquee
Continuous `translateX` loop, `--ease-linear`, full-loop ~40–60s (speed scales with content width). **Pauses on hover/focus.** Reduced-motion → static, manual horizontal scroll.

---

## 5. Motion Patterns by Category

### 5.1 Micro-interactions
| Element | Motion |
|---|---|
| Button hover | color `--dur-fast` `--ease-standard` |
| Button press | `transform: scale(.98)` `--dur-fast`; primary → Spark |
| Toggle/Switch | knob slide `--dur-fast` `--ease-standard`; track color |
| Checkbox/Radio | check stroke draw `--dur-fast` |
| Chip select | bg/border `--dur-fast` |
| Focus ring | **instant** (no transition) |
| Link underline | `--dur-fast` |

### 5.2 State transitions
| From→To | Motion |
|---|---|
| Loading→content | skeleton crossfades to content `--dur-base` `--ease-entrance` |
| Skeleton | shimmer sweep ~1.5s `--ease-linear` loop (reduced-motion: static) |
| Empty/Error appear | fade+`translateY(8→0)` `--dur-base` `--ease-entrance` |
| Value change | live-price tick (§4.5) |

### 5.3 Entrances / Exits (overlays)
| Component | Enter | Exit |
|---|---|---|
| **Modal** | scrim fade `--dur-base`; panel `scale .96→1` + `opacity 0→1` + `translateY 8→0` `--dur-slow` `--ease-emphasized` | reverse, `--dur-base` `--ease-exit` |
| **Drawer** | slide from **inline-end** `translateX(100%→0)` `--dur-slow` `--ease-emphasized` + scrim fade | `--ease-exit` `--dur-base` |
| **Bottom sheet** | `translateY(100%→0)` `--dur-slow` `--ease-emphasized`; drag-to-dismiss tracks finger | slide down `--dur-base` |
| **Toast** | slide-up + fade `--dur-base` `--ease-entrance` | fade `--dur-base` `--ease-exit` |
| **Popover / Menu / Mega-menu** | fade + `scale .98→1` from anchor `--dur-fast/base` | fade `--dur-fast` |
| **Tooltip** | fade `--dur-fast` after 150ms delay | fade `--dur-fast` |

### 5.4 Navigation transitions
| Transition | Motion |
|---|---|
| Page/route change | main content fade+`translateY(8→0)` `--dur-base`; **data-critical views render instantly** (no delay) |
| Tab change | active underline **slides** between tabs `--dur-base` `--ease-standard`; panel instant or quick crossfade |
| Accordion | height expand/collapse `--dur-base` `--ease-standard` (grid-rows/measured); chevron rotate `--dur-base` |
| Sticky header condense | height/opacity transition `--dur-base` on scroll threshold |
| Mega-menu open | §5.3 popover |

### 5.5 Feedback
- **Success:** check-circle + polite live region; subtle fade-in; no confetti.
- **Error:** alert + (OTP) one-time **shake** (`translateX ±4px`, 1 cycle, `--dur-fast`) — reduced-motion: static color only.
- **The Spark** on value/action (§4.1).

### 5.6 Data motion
- **Table:** rows appear instantly (or skeleton→content crossfade); **no per-row entrance cascade** on data tables (speed > flourish). Sort = quick reorder (`--dur-base`) or instant on large sets.
- **Chart:** line draws via `stroke-dashoffset` `--dur-slower` `--ease-entrance` on first render; updates morph quickly; crosshair follows pointer instantly.
- **نوسان / ticker:** §4.5/§4.6.

### 5.7 Scroll-based (minimal)
- Light **reveal-on-scroll** (fade+8px) only on marketing/story sections, **once**, small distance; **never** on data/tables. No parallax, no scroll-jacking, no large transforms (vestibular safety).

---

## 6. Choreography
- **Restraint first.** Most views need almost no orchestration.
- **Stagger** only for small marketing groups: 30–50ms between items, **max ~5** items, then stop.
- **Shared-element continuity** where it helps (rail item → category page header) — subtle, optional.
- One "lead" motion per view; supporting motions are quieter/faster.

---

## 7. Performance Rules
- **Animate only `transform` and `opacity`** (compositor-friendly, 60fps). Avoid animating `width/height/top/left`, `box-shadow`, `filter` in loops.
  - Accordions: use measured height/`grid-template-rows` transitions, not animating layout repeatedly; or `clip`/transform where possible.
  - The Spark uses a pseudo-element transform/opacity (not animating the element's own shadow continuously).
- **`will-change`** only just before an animation, removed after; never global.
- **No layout thrash:** batch reads/writes; reserve space (ticker/images) to avoid CLS.
- **60fps target;** test on mid-range Android. Drop/disable non-essential motion under load.

---

## 8. Reduced-Motion Fallback Table (`prefers-reduced-motion: reduce`)
| Motion | Reduced-motion fallback |
|---|---|
| The Spark | none (or instant static amber tick) |
| Rail name→image | instant swap |
| Streaming AI | full message at once; no cursor anim |
| Live-price tick | instant value change, static color (no fade) |
| Ticker marquee | static + manual scroll |
| Skeleton shimmer | static neutral block |
| Modal/Drawer/Sheet | opacity-only or instant; no slide/scale |
| Toast/Popover/Menu | instant or opacity-only |
| Tab underline / accordion | instant |
| Page transition | instant |
| Chart draw | static (rendered complete) |
| Error shake | none (static color) |
| Reveal-on-scroll | content shown, no motion |
> Implemented globally by zeroing duration tokens (§3) **and** guarding keyframe animations with the media query. **No information is lost** when motion is off.

---

## 9. Accessibility & Safety (recap, motion-specific)
- **No motion-only meaning** (always text/color/state too).
- **Auto-updating/moving content** (ticker) is **pausable** (2.2.2).
- **No flashing > 3×/sec** (2.3.1).
- **Vestibular-safe:** avoid large/full-screen zoom, spin, parallax; keep transforms small (≤16px translate, ≤1.15 scale).
- Focus indicators are **immediate** (not animated away).

## 10. RTL Motion
- Slides/drawers/sheets use **logical direction**: drawer & rail from **inline-end** (right in RTL); directional reveal respects RTL.
- Any "next/prev" or shared-element motion mirrors direction in RTL.
- Tab-underline and carousel motion follow the RTL flow.

## 11. Implementation Notes
- **CSS transitions** for state changes; **CSS keyframes** for loops (shimmer, spark, cursor, marquee).
- **Web Animations API** or a light lib (Motion One / Framer Motion) for orchestrated entrances in the app framework — but keep bundle small and SSR-safe.
- A single **motion utility/hook** reads `prefers-reduced-motion` (and an optional user setting) and gates animations centrally.
- Use the **tokens** (§3) everywhere — no hardcoded durations/easings in components.

## 12. Do / Don't
- **Do** keep motion short/weighted/purposeful; animate transform/opacity; honor reduced-motion; one lead motion per view; pause the ticker on hover.
- **Don't** use spring/bounce/elastic, cascade-animate tables, parallax/scroll-jack, animate layout in loops, exceed 400ms, convey meaning by motion alone, or animate the focus ring away.

## Bridge
- Completes the core UI/Design-System foundations: **Design Language · Color · Typography · Spacing · Components · Icons · Responsive · Accessibility · Motion.**
- **Next:** apply everything to **high-fidelity screen designs** (each Layer-2 wireframe), and build the **live HTML style tile** to validate color + type + spacing + components + icons + motion together.

*Ahantime — اول مشورت، بعد خرید.*
