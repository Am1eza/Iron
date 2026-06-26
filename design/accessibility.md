# Poladin — Accessibility (a11y)
## Layer 3 · UI / Design System — Document 8 of N

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** all foundations + `components.md`, `responsive-design.md`, `acceptance-criteria.md §1.3`.
**Target:** **WCAG 2.2 Level AA** (aligned with EN 301 549). Accessibility is part of the Definition of Done — not an afterthought.

### Principles (POUR)
Perceivable · Operable · Understandable · Robust. Plus a Poladin-specific lever: **the AI advisor «پولادین» is an accessibility feature** — it lets users who struggle with tables, jargon, or typing get prices and estimates conversationally.

---

## 1. Perceivable

### 1.1 Contrast (1.4.3 / 1.4.11)
- **Text ≥ 4.5:1**; large/bold (≥24px or ≥18.66px bold) ≥ 3:1 — verified in `color-system.md §10`.
- **Non-text contrast ≥ 3:1** for UI component boundaries, icons that carry meaning, focus indicators, and chart elements.
- **Never set body text** in `cobalt-500`, `amber-500/700`, or `gain-500` (use the deep variants).

### 1.2 Color is never the only signal (1.4.1)
- **نوسان** = color **+ arrow + sign**; status = color **+ icon + text**; selected = color **+ marker/check**; required fields = color **+ text/asterisk + `aria-required`**. Works in grayscale and for color-blind users.

### 1.3 Text resize, reflow, spacing (1.4.4 / 1.4.10 / 1.4.12)
- **rem-based** sizing → **200% zoom** with no loss of content/function.
- **Reflow to 320px** width without 2-D scrolling (the table→card transform satisfies this).
- Tolerates user **text-spacing** overrides (line-height 1.5×, etc.) without clipping (we already use generous Persian leading).
- Min readable text 12px; body ≥16px; inputs ≥16px.

### 1.4 Images & non-text (1.1.1)
- **Meaningful images:** descriptive `alt` (mill/customer logos = the company name; category images = the category).
- **Decorative images/icons:** `alt=""` / `aria-hidden="true"`.
- **Icon-only controls:** `aria-label` (never icon-only without a name).
- **The table-image export** is a convenience artifact, **not** the data source — the live HTML table remains the accessible truth (no text-in-image for primary content).
- Charts: text alternative + data-table fallback (§9).

### 1.5 Sensory & orientation (1.3.3 / 1.3.4)
- Instructions never rely on shape/position/color alone ("روی دکمهٔ نارنجی" → also name it).
- No orientation lock; works portrait and landscape.

---

## 2. Operable

### 2.1 Keyboard (2.1.1 / 2.1.2 / 2.1.4)
- **Everything operable by keyboard**; no keyboard traps (except intentional modal focus-trap which Esc exits).
- Logical **focus order** following the visual (RTL) reading order.
- No single-character shortcuts without a modifier/opt-out.

### 2.2 Focus visible & not obscured (2.4.7 / 2.4.11 / 1.4.11)
- **Visible focus ring:** 2px `--color-focus` + 2px offset on **every** interactive element (≥3:1 contrast).
- **Focus not obscured:** sticky ticker/header must not cover a focused element → use `scroll-margin-block` and ensure the focused item scrolls into clear view.

### 2.3 Focus management
- **Modal/drawer:** focus moves in on open, **trapped**, Esc closes, **focus returns** to the trigger.
- **Menus / mega-menu / rail / tabs:** **roving tabindex** + arrow-key navigation; Home/End; Esc closes menus.
- **Route changes:** move focus to the new page's main heading; announce via a polite live region.
- **Skip link:** «پرش به محتوا» as first focusable element → jumps to `<main>`.

### 2.4 Target size & pointer (2.5.8 / 2.5.7 / 2.5.1)
- **Targets ≥ 44×44px** (exceeds the 24px AA minimum); ≥8px spacing between targets.
- **Dragging has a non-drag alternative:** CRM kanban (drag) also offers a status **select**; chart crosshair works via tap/keyboard; no path-based gestures required.

### 2.5 Timing (2.2.1) — important for our flows
- **OTP (`OTP_TTL` 120s):** before expiry, allow **resend**; expiry shows a clear message and a one-tap resend — user is never silently locked out. Lock-after-attempts shows remaining time.
- **Quote validity countdown:** informational only; expiry offers a **refresh**, never destroys the request (kept as draft).
- **Session:** long-lived (30 days); if a timeout ever applies, warn and allow extension (2.2.1).

### 2.6 Seizures & motion (2.3.1 / 2.2.2)
- No content flashes > 3×/second.
- **The ticker marquee** is **pausable** (pause on hover/focus) and respects `prefers-reduced-motion` (static + manual scroll) — satisfies 2.2.2 (moving/auto-updating content).
- **`prefers-reduced-motion`** disables the Spark, crossfades, skeleton shimmer, streaming animation, and drawer transitions (instant/static). No essential meaning is conveyed by motion alone.

---

## 3. Understandable

### 3.1 Language & direction (3.1.1 / 3.1.2)
- `<html lang="fa" dir="rtl">`; inline language changes (Latin terms/English) wrapped with `lang="en"` + `<bdi>` so screen readers switch voice/pronunciation correctly.
- Persian numerals announced correctly; phone numbers LTR-isolated.

### 3.2 Consistent & predictable (3.2.3 / 3.2.4 / 3.2.6)
- Navigation and component behavior are **consistent across pages** (the nav system is fixed).
- **Consistent help (3.2.6):** contact/«پشتیبانی»/AI help in the same place site-wide.
- No unexpected context changes on focus/input (e.g., selecting a filter doesn't auto-navigate without action).

### 3.3 Input assistance (3.3.1–3.3.8)
- **Labels & instructions (3.3.2)** on every field (visible `<label>`, not placeholder-only).
- **Error identification (3.3.1)** in text + `aria-invalid` + `aria-describedby` pointing to the message; not color-only.
- **Error suggestion (3.3.3):** tell the user how to fix («شمارهٔ موبایل باید با ۰۹ شروع شود»).
- **Error prevention (3.3.4):** destructive/admin actions confirm; submissions are reversible/reviewable (پیش‌فاکتور preview before request finalizes).
- **Redundant entry (3.3.7):** don't re-ask known info — the AI/cart/profile carry items and contact forward into the request.
- **Accessible authentication (3.3.8):** OTP via SMS, **paste allowed**, no transcription/memory puzzle, no CAPTCHA-style cognitive test required to log in.

---

## 4. Robust

### 4.1 Semantic HTML first (4.1.2)
- Use native elements (`button`, `a`, `table`, `nav`, `main`, `header`, `footer`, `label`, `input`) before ARIA. **ARIA only to fill gaps.**
- Every control exposes correct **name, role, value**.

### 4.2 Landmarks
- `header` · `nav[aria-label="ناوبری اصلی"]` · `nav[aria-label="دسته‌بندی محصولات"]` (rail) · `nav[aria-label="مسیر صفحه"]` (breadcrumb) · `main` · `aside` · `footer` · search region. One `main` per page.

### 4.3 Status messages (4.1.3)
- **Polite live region** (`aria-live="polite"` / `role="status"`): "قیمت‌ها به‌روزرسانی شد", "درخواست ثبت شد", form save, AI message completion.
- **Assertive** (`role="alert"`): blocking errors (OTP failed, submission error).
- **The ticker is NOT a live region** (would spam SR); values are reachable on focus.

---

## 5. Component ARIA Patterns (WAI-ARIA APG)
| Component | Pattern / key attributes |
|---|---|
| **Button** | `<button>`; `aria-busy` (loading); `aria-disabled`; `aria-pressed` (toggles) |
| **Link** | `<a href>`; external → note in name |
| **Input/Textarea** | `<label for>`; `aria-invalid`, `aria-describedby`, `aria-required` |
| **Select** | native `<select>` or Listbox pattern (`role=listbox/option`, `aria-selected`, arrow keys) |
| **Search autosuggest** | **Combobox**: `role=combobox` `aria-expanded` `aria-controls` `aria-activedescendant`; listbox of options |
| **Checkbox/Radio** | native inputs + label; group `fieldset/legend` |
| **Switch (VAT/unit)** | `role="switch"` `aria-checked` + visible label |
| **Tabs** | `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, arrow keys |
| **Modal/Dialog** | `role="dialog" aria-modal="true"` + `aria-labelledby`; focus trap; Esc |
| **Drawer/Sheet** | dialog semantics; from inline-end; trap + return focus |
| **Menu / Mega-menu** | disclosure `button[aria-expanded][aria-haspopup]` + menu; roving focus; Esc |
| **Category Rail** | `nav` + list; items are links; `aria-current="page"`; arrow-key roving; **hover-image has tap/focus equivalent** |
| **Ticker** | `aria-label`; pausable; not a live region |
| **Data table** | native `table`, `caption`, `th[scope]`; sortable header `aria-sort="ascending/descending/none"` |
| **Chart** | `role="img"` + `aria-label` summary **and** a visually-hidden/`<details>` data-table fallback |
| **Toast/Alert** | `role="status"` (info) / `role="alert"` (error); dismissible, focusable action |
| **Tooltip** | `role="tooltip"`, `aria-describedby`; hover **and** focus; never sole source of essential info |
| **Breadcrumb** | `nav[aria-label]` + ordered list + `aria-current="page"` |
| **Pagination** | `nav[aria-label]` + `aria-current="page"` |
| **Accordion** | `button[aria-expanded][aria-controls]` + region |
| **OTP** | grouped, labeled, `inputmode=numeric`, paste-fill, status/time announced |
| **AI Chat** | log/region `aria-live="polite"`; labeled input; messages role-distinguished (see §7) |
| **Stepper/Progress** | `aria-valuenow/min/max` or text equivalent |

---

## 6. Forms & OTP — detailed
- Visible labels; required marked in text + `aria-required`; helper text via `aria-describedby`.
- **Inline validation** announced (polite); on submit, **focus moves to the first error**, and a summary lists errors (linked).
- Errors: text + icon + `aria-invalid`, with a fix suggestion.
- **OTP:** numeric inputs, paste allowed, auto-advance is enhancement (not required), resend/lock state announced, timer not the only cue; never block login behind a cognitive puzzle.
- `autocomplete` tokens (`tel`, `name`, `one-time-code` for OTP) for autofill.

---

## 7. AI Chat Accessibility (special)
- **Container:** `role="log"`/region with `aria-live="polite"`; new completed messages are announced (announce the **finished** message, not every streamed token — avoid SR spam).
- **Streaming:** purely visual; the accessible announcement is the final message text; a "در حال نوشتن" status is polite.
- **Messages:** user vs پولادین visually + semantically distinguished (e.g., prefix/`aria-label`).
- **Suggested chips** are real `<button>`s, keyboard-reachable.
- **Estimate card** is a structured, readable region (headings + data), not an image.
- **As an a11y aid:** the AI lets users avoid the dense table entirely — a low-vision or less-literate user can ask «قیمت میلگرد ۱۴» and get a spoken-friendly answer.

---

## 8. Data Table Accessibility
- Native `<table>` with `<caption>` (category + last-updated), `<thead>`, `<th scope="col">`.
- **Sortable columns:** `aria-sort` on the active header; sort control is a button inside the `th`.
- Numeric cells tabular and associated with their header for SR context.
- The **mobile card** layout keeps label→value pairs programmatically associated.
- Row actions are labeled buttons; the primary «درخواست» is reachable.

## 9. Chart Accessibility
- `role="img"` with an `aria-label` summarizing the trend ("روند قیمت میلگرد ۱۴ در ۳۰ روز اخیر، صعودی، از … تا …").
- A **data-table fallback** (in `<details>` or visually-hidden) lists the points.
- Crosshair/read-point operable by keyboard; color segments paired with labels.

---

## 10. RTL & Persian-specific a11y
- Correct `dir`/`lang` so screen readers use a **Persian voice** and read right-to-left order properly.
- **Bidi isolation** (`<bdi>`, `lang="en"`) for Latin codes/numbers/phones prevents mis-reading.
- Persian digits and Jalali dates announced correctly; avoid reading «۱۴۰۵/۰۴/۰۵» as a fraction (use proper date markup/labels).
- Verify with Persian-capable SRs (NVDA+eSpeak/Persian, VoiceOver, TalkBack).

## 11. Cognitive Accessibility
- **Plain Persian**, short sentences, jargon explained (glossary/AI).
- **Consistent layout & help**; predictable actions; clear primary action per screen (one amber).
- **The AI** reduces cognitive load (intent-first guidance, estimates, plain answers).
- Avoid time pressure as the only path (OTP resend; quote refresh).
- Generous, forgiving forms (redundant-entry avoided; review before submit).

---

## 12. WCAG 2.2 AA — Conformance Checklist (mapped)
| SC | Title | How we meet it |
|---|---|---|
| 1.1.1 | Non-text content | alt/aria-label rules (§1.4) |
| 1.3.1/.2/.3 | Info & relationships / sequence / sensory | semantic HTML, landmarks, no sensory-only |
| 1.4.1 | Use of color | color + icon/arrow/text (§1.2) |
| 1.4.3/.11 | Contrast / non-text contrast | color-system §10 |
| 1.4.4/.10/.12 | Resize / reflow / text spacing | rem, table→card, generous leading (§1.3) |
| 2.1.1/.2/.4 | Keyboard / no trap / shortcuts | §2.1 |
| 2.2.1/.2 | Timing / pause-stop-hide | OTP/quote/session, pausable ticker (§2.5/2.6) |
| 2.3.1 | Three flashes | no rapid flashing |
| 2.4.1/.2/.3/.4/.7 | Skip / title / focus order / link purpose / focus visible | §2.2/§2.3, page titles, descriptive links |
| 2.4.11 | Focus not obscured (min) | scroll-margin under sticky bars |
| 2.5.7/.8 | Dragging alt / target size | §2.4 |
| 3.1.1/.2 | Language of page/parts | lang/dir + bidi (§3.1) |
| 3.2.3/.4/.6 | Consistent nav/identification/help | §3.2 |
| 3.3.1/.2/.3/.4/.7/.8 | Errors, labels, suggestion, prevention, redundant entry, accessible auth | §3.3, §6 |
| 4.1.2/.3 | Name/role/value / status messages | §4.1, §4.3 |
*(4.1.1 Parsing was removed in 2.2; we still ship valid markup.)*

---

## 13. Testing Methodology
- **Automated:** axe-core / Lighthouse / pa11y in CI on key templates (catches ~30–40%).
- **Manual keyboard:** full task flows (browse → AI → request → OTP → پیش‌فاکتور) with keyboard only.
- **Screen readers:** **NVDA + Firefox** (Persian), **VoiceOver iOS Safari**, **TalkBack Android Chrome** — verify Persian pronunciation, landmarks, live regions, table semantics, modal focus.
- **Zoom/spacing:** 200% zoom + text-spacing bookmarklet — no clipping.
- **Reduced-motion & contrast:** verify motion off; grayscale check (color-not-alone).
- **Real users:** ideally test with Persian-speaking users incl. assistive-tech users.
- **DoD gate:** no critical axe violations; keyboard + SR pass on core flows; per `acceptance-criteria.md` global G4.

## 14. Governance
- a11y is in **every component's spec** and the **Definition of Done**.
- New components ship with their ARIA pattern + keyboard support documented.
- Regressions are bugs, not enhancements.

## 15. Do / Don't
- **Do** use semantic HTML, label everything, manage focus, announce status politely, pair color with text/icon, allow OTP paste, respect reduced-motion, ≥44px targets.
- **Don't** use icon-only controls without names, color-only signals, hover-only essentials, `100vh` traps, disabled zoom, keyboard traps, or aria-live on the ticker.

## Bridge
- Encodes `acceptance-criteria.md §1.3` into an implementable a11y standard across all components.
- **Next recommended:** Motion/Interaction spec (with reduced-motion already specified here), then high-fidelity screens — and the **live HTML style tile** (built accessible from the start).

*Poladin — اول مشورت، بعد خرید.*
