# Poladin — Empty, Zero & Error States
## Layer 3 · UI / Design System — Document 10 of N (final core)

**Version:** 1.0 · 26 June 2026
**Status:** Draft for approval
**Builds on:** `components.md (C6 Empty State)`, `design-language.md`, `motion-design.md`, `accessibility.md`.
**Purpose:** Specify every empty / zero-data / no-result / error / offline / stale state precisely — structure, copy, CTA, and behavior — so the product is **never a dead-end** and every "nothing here" becomes a helpful, on-brand moment that moves the user forward (Design Language §10: "no dead-ends").

### Principles
1. **No dead-ends.** Every empty/error/stale view offers a way forward — usually **«ثبت درخواست»** or **«پرسش از پولادین»** or **retry**.
2. **Helpful, not blank.** Explain *what* and *why* in one breath; give the next action.
3. **Never blame the user.** Warm Persian; no jargon; **no English/technical errors** ever shown.
4. **On-brand & quiet.** The structural I-beam/category glyph, muted, minimal — not a cartoon.
5. **Don't flash empty.** Show a skeleton while loading; reveal an empty state **only after** confirmed zero (anti-flash, §6).
6. **Turn empties into funnel moments.** An empty cart, no results, or a 404 is a chance to surface the AI, popular categories, or a request.

---

## 1. State Taxonomy (and when each applies)
| Type | Trigger | Intent |
|---|---|---|
| **First-use / no-data-yet** | user has no favorites/requests/alerts yet | onboard + invite first action |
| **No-results** | search/filter returned nothing | relax/clear + offer AI/request |
| **Cleared** | user emptied something (cart) | confirm + re-route to browse |
| **No-price / stale** | SKU has no/stale price (`[Stale-Price]`) | «تماس بگیرید» + request (never blank/false number) |
| **Error (load)** | data fetch failed | reassure + **retry** |
| **404 (not found)** | bad/old URL | redirect home + search + AI |
| **500 (server)** | server fault | reassure + retry + contact |
| **Offline** | no connection | inform + auto-retry on reconnect |
| **Blocked / auth** | login required (e.g., `/حساب`) | route to OTP login |
| **Degraded / stale source** | tgju/AI relay down | show last-known + indicator (NOT empty) |
| **Success-empty (positive)** | "all caught up" — no triggered alerts | affirm calmly |

---

## 2. Anatomy & Visual Spec
```
┌───────────────────────────────┐
│            ◭ glyph             │  ← structural line glyph (I-beam/category icon), 40–64px, muted
│      «عنوان کوتاه»             │  ← headline  --t-h4 / text-strong
│  توضیح یک‌خطی و کمک‌کننده.       │  ← body  --t-body-sm / text-muted, ≤2 lines, measure ≤ 360px
│   [ اقدام اصلی (amber) ]       │  ← ONE primary CTA
│   [ اقدام دوم ]  ·  «پرسش از پولادین» │  ← optional secondary / AI
└───────────────────────────────┘
```
- **Glyph:** 1.75-stroke line glyph from the icon family (I-beam motif or the context's icon), color `--neutral-300/400`; **never** a 3D/mascot illustration.
- **Headline:** `--t-h4`, `--color-text-strong`, 2–5 words.
- **Body:** `--t-body-sm`, `--color-text-muted`, 1–2 lines.
- **Primary CTA:** the one amber action (Components A1); secondary = ghost/link; AI prompt always available as a link.
- **Spacing:** centered; vertical gaps `--space-4`; container padding `--space-12`+; max-width ~480px.
- **Entrance:** fade + `translateY(8→0)` `--dur-base` `--ease-entrance`; reduced-motion → instant.

### Sizes / placement
| Size | Use |
|---|---|
| **Full-page** | 404/500/offline, first-use of a whole section, empty account tab |
| **Section / card** | embedded in a panel (empty table, empty list within a page) |
| **Inline / compact** | small region (filter no-results in a table body, empty chart) — glyph optional, single line + link |

---

## 3. State Decision Matrix (don't confuse them)
| Condition | Show |
|---|---|
| Request in flight | **Skeleton/loading** (never empty) |
| Confirmed zero results, request OK | **Empty state** (no-results) |
| Request failed (network/server) | **Error state** (retry) — *not* empty |
| Partial data / source degraded | **Content + stale indicator** — *not* empty/error |
| No price for a real SKU | **«تماس بگیرید» + request** — *not* blank |
| Offline | **Offline state** (auto-retry) |
> **Anti-flash rule:** wait for the confirmed empty result before swapping skeleton → empty; if data may stream, keep skeleton until first byte.

---

## 4. Tone & Copy Guidelines
- Warm, plain Persian; short; helpful next step; **no blame**, no exclamation spam, no English.
- Error copy = reassurance + action, never a code/stack («مشکلی پیش اومد، دوباره تلاش کنید» — not "Error 500").
- Always name the action clearly (a11y: don't say "دکمهٔ زیر").

---

## 5. Per-Context Catalog — Public (exact copy)
> Glyph in brackets; **Primary** = amber CTA; *Secondary* = ghost/link.

| Context | Type | Headline | Body | Primary | Secondary |
|---|---|---|---|---|---|
| **Price table — filter no-results** | no-results | «موردی پیدا نشد» | با این فیلترها محصولی نیست. فیلترها رو ساده‌تر کنید یا از پولادین بپرسید. | **حذف فیلترها** | *پرسش از پولادین* |
| **Price table — empty category** | first-use | «به‌زودی در این دسته» | هنوز محصولی در این دسته ثبت نشده. درخواست بدید تا کارشناس کمک کنه. | **ثبت درخواست** | *دسته‌های دیگر* |
| **SKU — no/stale price** | no-price | «قیمت لحظه‌ای بگیرید» | قیمت این محصول رو کارشناس به‌روز اعلام می‌کنه. | **ثبت درخواست** | *تماس* `۰۹۱۲۱۳۹۵۹۵۴* |
| **Site search — no results** | no-results | «چیزی پیدا نشد» | برای «{q}» نتیجه‌ای نبود. املا رو بررسی کنید یا از پولادین بپرسید. | **پرسش از پولادین** | *مشاهدهٔ دسته‌ها* |
| **AI — missing data fallback** | degraded | (در گفتگو) «الان قیمت دقیق رو ندارم» | کارشناس بهتون اعلام می‌کنه. درخواست‌تون رو ثبت کنم؟ | **ثبت درخواست** | *ادامهٔ گفتگو* |
| **AI — relay down** | error | «الان نمی‌تونم محاسبه کنم» | چند لحظه دیگه دوباره امتحان کنید، یا درخواست بدید تا کارشناس تماس بگیره. | **ثبت درخواست** | *تلاش دوباره* |
| **Favorites — empty** | first-use | «علاقه‌مندی‌ای ندارید» | محصول‌ها رو با ♡ ذخیره کنید تا اینجا ببینیدشون. | **مشاهدهٔ قیمت‌ها** | — |
| **Requests/history — empty** | first-use | «هنوز درخواستی ثبت نکردید» | از جدول قیمت یا پولادین، درخواست بدید تا اینجا پیگیری کنید. | **مشاهدهٔ قیمت‌ها** | *پرسش از پولادین* |
| **Alerts — empty** | first-use | «هشداری ندارید» | برای هر محصول یا دلار/طلا هشدار بذارید تا خبرتون کنیم. | **ساخت هشدار** | — |
| **Alerts — none triggered** | success-empty | «همه‌چیز آرومه» | هنوز هیچ هشداری فعال نشده. خیالتون راحت. | *مدیریت هشدارها* | — |
| **Inquiry cart — empty** | cleared | «سبد استعلام خالیه» | محصول‌ها رو به سبد اضافه کنید تا یک‌جا پیش‌فاکتور بگیرید. | **بازگشت به قیمت‌ها** | *پرسش از پولادین* |
| **Account — first visit** | first-use | «به پولادین خوش اومدید» | قیمت‌ها رو ببینید، هشدار بذارید و درخواست بدید. | **مشاهدهٔ قیمت‌ها** | *عضویت در باشگاه* |
| **Club — not a member** | first-use | «باشگاه پولادین» | با عضویت، قیمت ویژه، تحویل اولویت‌دار و مشاور اختصاصی بگیرید. | **عضویت** | *بیشتر بدونید* |
| **Blog/News — empty category** | no-data | «به‌زودی مطلب جدید» | الان مطلبی در این بخش نیست. سری به دسته‌های دیگر بزنید. | *همهٔ مطالب* | — |
| **Chart — insufficient history** | no-data | «تاریخچهٔ کافی نیست» | به‌محض ثبت قیمت‌های بیشتر، نمودار اینجا نمایش داده می‌شه. | *مشاهدهٔ قیمت امروز* | — |
| **طلا و ارز / ticker — source down** | degraded | (روی ریبون) «به‌روزرسانی با تأخیر» | آخرین مقادیر نمایش داده می‌شه. | *تلاش دوباره* | — |
| **Cooperation — submitted** | success | «درخواست همکاری ثبت شد» | کارشناس ما به‌زودی تماس می‌گیره. ممنون از شما. | **بازگشت به خانه** | — |
| **404** | not-found | «این صفحه پیدا نشد» | شاید آدرس عوض شده. از جستجو یا پولادین کمک بگیرید. | **بازگشت به خانه** | *جستجو · دسته‌های پرطرفدار · پرسش از پولادین* |
| **500 / server** | error | «مشکلی پیش اومد» | از طرف ما بود. چند لحظه دیگه دوباره امتحان کنید. | **تلاش دوباره** | *تماس با ما* |
| **Offline** | offline | «اتصال اینترنت قطعه» | به‌محض وصل‌شدن، خودش به‌روز می‌شه. | **تلاش دوباره** | — |
| **Auth required** | blocked | «برای ادامه وارد شوید» | با شمارهٔ موبایل و کد پیامکی وارد بشید. | **ورود** | — |

> *Phone/CTA values come from settings; شماره و آدرس واقعی در پاورقی و صفحهٔ تماس.

---

## 6. Per-Context Catalog — Admin
| Context | Type | Headline | Body | Primary |
|---|---|---|---|---|
| **CRM — no leads** | first-use | «لیدی نیست» | وقتی کاربر درخواست بده، اینجا نمایش داده می‌شه. | — |
| **CRM — filter no-results** | no-results | «نتیجه‌ای نیست» | فیلترها رو تغییر بدید. | حذف فیلترها |
| **Content — no drafts** | first-use | «پیش‌نویسی برای تأیید نیست» | پیش‌نویس‌های AI اینجا میان. | تولید مطلب |
| **Catalog — empty** | first-use | «کاتالوگ خالیه» | اولین دسته/محصول رو بسازید تا قیمت‌گذاری شروع بشه. | افزودن دسته |
| **Price grid — all stale** | warning | «۴ کالا امروز به‌روز نشده» | بعد از استعلام، قیمت‌ها رو ثبت کنید. | فیلتر «به‌روزنشده» |
| **Price grid — no SKUs in category** | no-data | «محصولی در این دسته نیست» | از کاتالوگ SKU اضافه کنید. | رفتن به کاتالوگ |
| **Audit log — empty** | no-data | «رویدادی ثبت نشده» | تغییرات اینجا ثبت می‌شه. | — |
| **Analytics — no data yet** | first-use | «هنوز داده‌ای نیست» | با شروع ترافیک، گزارش‌ها پر می‌شه. | — |
| **Load error (any admin)** | error | «بارگذاری نشد» | دوباره تلاش کنید. | تلاش دوباره |

---

## 7. Error States — detail
- **Distinguish error from empty:** error = something failed (offer **retry**); empty = nothing exists yet (offer **create/browse**). Never show "no data" when a fetch actually errored.
- **Retry mechanics:** retry button re-fetches; show inline spinner on retry; after N failures, suggest «تماس با ما». Preserve any user input (drafts).
- **Partial failure:** if one widget fails on a page, scope the error to that widget (its own error state) — don't blow up the whole page.
- **Form/OTP errors** live with the field (acceptance-criteria §F2 / accessibility §6), not as page-level empties.

## 8. Degraded / Stale (never empty)
- **tgju down:** ticker/طلا‌و‌ارز show **last-known values + «با تأخیر»** indicator (not empty).
- **AI relay down:** AI surfaces a graceful message + «ثبت درخواست» (not a blank chat).
- **Stale price:** show price + its real date, or «تماس بگیرید» — **never a blank or a false fresh number**.

## 9. Accessibility
- Empty/error states are **announced** via a polite live region when they replace loading content; focus moves to the empty state's heading on full-page errors/404.
- The **CTA is keyboard-reachable** and clearly named (not "دکمهٔ بالا").
- Glyph is decorative (`aria-hidden`); meaning is in the text.
- Color is never the only signal (icon + text).

## 10. Responsive
- Full-page empties: glyph 48–64px desktop / 40–48 mobile; copy stays ≤2 lines; CTA full-width on mobile.
- Inline empties in table cards: compact single line + link, no large glyph.
- Maintain the centered, breathable layout at all sizes.

## 11. Motion
- Gentle entrance (§2); the I-beam glyph may use a one-time subtle draw on first appearance (reduced-motion: static). No looping/attention-grabbing animation on empties (calm).

## 12. Do / Don't
- **Do** always give a next action; explain briefly; show skeleton before empty; keep Persian/warm; distinguish error vs empty; surface the AI/request.
- **Don't** show a bare "خالی"/blank, an English error, a dead-end, a false price, a flashing empty during load, or a cartoon illustration.

## Bridge — Layer 3 complete
This completes **Layer 3 — UI / Design System**:
**Design Language · Color · Typography · Spacing · Components · Icons · Responsive · Accessibility · Motion · Empty States.**

Recommended next: build the **live HTML style tile / reference implementation** (proves the whole system renders premium, custom, accessible, and motion-correct), then **high-fidelity screen designs** for each Layer-2 wireframe — leading into **Layer 4 (build)**.

*Poladin — اول مشورت، بعد خرید.*
