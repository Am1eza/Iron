# Production Audit — آهن‌تایم (ahantime.com)

Full multi-domain audit of the live production app (Next.js 15 / React 19 /
Postgres 16 / Docker on AlmaLinux 9). 10 domains audited against the codebase +
the live site, grounded in current (2026) best practices. Every finding was
verified against real code (`file:line`), not speculation.

## Domain scores (as audited, before fixes)

| Domain | Score | Domain | Score |
|---|---|---|---|
| Application security | 82 | API design & errors | 86 |
| Infrastructure security | 76 | AI advisor quality | 82 |
| Frontend performance | 76 | Code quality | 82 |
| Accessibility (WCAG 2.2 AA) | 86 | UI/UX + Persian RTL | 86 |
| SEO | 72 | Backend + database | 72 |

Strong baseline overall. The two lowest (SEO 72, Backend 72) carry the biggest
upside and hold most of the high-severity items below.

---

## ✅ Fixed and shipped (this pass)

**Security**
- CSRF check now **fails closed** on state-changing methods when `Origin` is
  absent (`src/lib/auth/origin.ts`) — verified no-origin→403, correct→200, foreign→403.
- `/api/me/requests/import` no longer accepts a client-supplied `status`
  (blocked fabricating a favorable "quoted" status).
- Caddy: edge HSTS backstop, 20 MB request-body cap, stripped
  `x-nextjs-*`/`X-Powered-By` debug headers.
- Containers: `no-new-privileges` on all, `cap_drop: ALL` on web, RAM/PID limits.
- `/styleguide` internal kitchen-sink is no longer served in production.

**Reliability / backend**
- 🔴 **Nightly Postgres backups** (systemd timer, 14-day retention) — there were
  **none**; this was the single highest-severity gap. Verified with an immediate dump.
- Postgres tuned for the 1.5 GB / 4-vCPU host (was stock defaults).

**Performance**
- Header logo: `sizes="66px"` — stops preloading a ~1920 px variant for a 36 px mark.
- `/api/market`: public `s-maxage`+SWR caching instead of `no-store`.

**AI advisor**
- Enabled live on DeepSeek `deepseek-v4-pro` (streaming, tool-grounded).
- `max_tokens` 1000→2000 (multi-factory answers were truncating).
- `/api/ai/chat` now returns the app-wide `{error:'validation',fields}` envelope.

**SEO**
- Product JSON-LD gains `priceValidUntil` (removes Google's missing-validity warning).

---

## 📋 Prioritized backlog (verified; needs review / product time)

### P0 — high value, recommend next
1. **SEO · SKU pages have no crawlable `<a>` links** — the catalog's ~250 revenue
   pages are reachable only via `sitemap.xml` and a JS `router.push` inside a
   modal (`src/components/catalog/PriceTable.tsx:489`). Render product rows and
   sub-category chips as real `<Link>`. *Biggest single ranking lever.*
2. **Backend · lead→proforma→SMS is multi-write, non-atomic, non-idempotent**
   (`src/lib/server/services/leads.service.ts:154`, `src/app/api/leads/route.ts`).
   A resubmit/partial failure can duplicate leads + proformas + **SMS sends**.
   Wrap in a transaction + idempotency key.
3. **Backend · unbounded append-only tables** (`sms_log`, `audit_entries`,
   `ai_messages/conversations/usage`, `contact_messages`) — add retention to
   `cleanup.job.ts`. *(Needs a retention-period decision — that's why it's not auto-applied.)*

### P1 — AI advisor polish (toward best-in-class)
- Inject **live domain context** (categories, price ranges, units) into the system
  prompt so trivial queries skip a tool round.
- Handle `finish_reason==='length'` explicitly (graceful "continue").
- **Client-side abort/stop** button for in-flight answers.
- Harden the per-conversation SMS cap against `conversationId` rotation.
- Grounding architecture is already **best-in-class** (tools decide every number,
  post-generation validator) — keep it.

### P1 — SEO / a11y / API
- Sitemap `lastmod` uses build-time `now()` for all pages — emit real timestamps.
- Add `hreflang` alternates (site offers en/ar/zh) and `NewsArticle` schema for `/news`.
- OTP incomplete-code error has a dangling `aria-describedby` (SR users hear nothing) —
  `OtpInput.tsx` / `LoginForm.tsx`.
- Nav dropdown triggers missing `aria-haspopup`/`aria-controls`; ticker needs a pause control.
- Paginate `/api/me/{leads,orders,requests}` (hard-capped at 100–200 today).
- `reportError` scrubs PII by key name only — also scrub by value pattern (mobile/OTP).
- DeepSeek fallback leg isn't covered by the request timeout.

### P2 — hygiene / infra
- Route-group error boundaries for `admin`/`account`/`cart`.
- Install `@vitest/coverage`; migrate to ESLint 9 flat config; drop unused `msw`.
- CI deploys over SSH **as root** with a full-shell key; pin GitHub Actions to
  commit SHAs and base images to digests.
- Cart uses a native `window.confirm()` (unstyled LTR dialog) — replace with the app modal.
- Global `loading.tsx` shows a price-table skeleton on every route.

---

## Notes
- Full raw findings (every `file:line`, severity, and fix) were produced by a
  12-agent audit; this document is the deduped, verified synthesis.
- Nothing in the backlog is auto-applied because each item either refactors a
  core revenue flow (1, 2) or needs a product decision (retention periods,
  hreflang locales) — they should land with their own tests/review.
