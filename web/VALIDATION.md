# Poladin Web — Validation
## Layer 4 · Frontend — Document 5 (Validation)

**Version:** 1.0 · 26 June 2026
**Builds on:** `FORMS.md`, `product/acceptance-criteria.md` (§1.4 constants, §F), `product/data-model.md`.
**Purpose:** The end-to-end validation strategy — every boundary, one source of truth (Zod), Persian errors, fail-fast env. Validation is not just for forms; it guards **client input, server requests, external responses, domain rules, URL params, and environment**.

## 1. Principles
1. **Single source.** Zod schemas (`lib/validation/*`) are reused by **forms, API routes, and boundary parsing**; types are inferred (`z.infer`).
2. **Never trust the client.** Every API route **re-validates** its body with the same schema (client validation is UX only).
3. **Validate at every boundary** — user input, our API, *external* data (tgju/DeepSeek/backend), URL params, env.
4. **Normalize then validate** — Persian/Arabic digits, mobile, ZWNJ, trimming — before rules run.
5. **Fail-fast env** — missing/invalid required secrets stop the server, not the user.
6. **Persian, field-level errors** — never English/stack; mapped back to the offending field.

## 2. Validation Layers
| Layer | Where | Tool |
|---|---|---|
| **Client form** | RHF + `zodResolver` | `lib/validation/schemas.ts` |
| **Server request** | API route handlers | `validateBody()` + `lib/validation/api.ts` |
| **External response** | endpoints parsing tgju/DeepSeek/backend | response schemas + `safeParse` |
| **Domain / business rules** | pricing, OTP, quote, freshness | `lib/validation/domain.ts` (+ constants) |
| **URL / params** | catalog filters, `?q=` | `parseFilters()` (safe defaults) |
| **Environment** | startup (server) | `lib/validation/env.ts` |

## 3. Schema Strategy
- **Form schemas** → `schemas.ts` (login/request/alert/cooperation/contact/weight).
- **API request/response schemas** → `api.ts` (otp, lead, weight payloads; market/table responses; filters).
- **Shared primitives** (`mobileSchema`, `otpCodeSchema`, `numberSchema`) live once and compose.
- Types: `z.infer` for form/request values; hand-written **domain types** (`lib/types/domain.ts`) mirror the data-model contract — response schemas are kept consistent with them (asserted in tests).

## 4. Client validation
RHF `mode: 'onSubmit'` (then `onChange` after first error); `shouldFocusError` jumps to the first invalid field; errors render in text + `aria-invalid` + `aria-describedby` (a11y).

## 5. Server validation (`validateBody`)
Every route reads JSON → `schema.safeParse` → on failure returns **`400 { error:'validation', fields }`** (Persian field map); on success works with the typed `data`. *No route trusts a raw body.*

## 6. External-data / response validation
Responses from tgju, the DeepSeek relay, and the backend are **parsed with `safeParse`** at the endpoint boundary. Invalid/partial external data → **graceful fallback** (last-known ticker value + `isStale`; AI → callback) — never a crash, never bad data shown.

## 7. Domain / business-rule validation (`domain.ts`)
Encodes the acceptance-criteria constants:
- `computeMovement(current, prev)` → نوسان % + direction.
- `isPriceFresh(updatedAt)` (same Jalali day) / `shouldHidePrice(updatedAt)` (beyond `PRICE_STALE_HIDE_AFTER`) → governs «تماس بگیرید».
- `isValidAdminPrice(n)` (> 0) — admin price-entry guard.
- OTP/quote helpers (TTL, attempts, validity) — UI mirrors; server enforces.

## 8. Input normalization & sanitization
- Digits normalized (Persian/Arabic→Latin) before parsing; mobile → `09…`; strings trimmed.
- **No `dangerouslySetInnerHTML` with user/AI content** (only static JSON-LD). React escapes by default; markdown (blog) rendered via a safe renderer (content section).
- Allowlists for enums (channel, op, track, sort) — reject unknown values.

## 9. Environment validation (`env.ts`)
- **Public** vars validated always (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_MODE`).
- **Server** vars validated lazily server-side; in **`live`** mode required secrets (DeepSeek, Kavenegar, session) are enforced; in **`mock`** they're optional. Invalid → throw at startup.

## 10. URL / param validation
Catalog filters and search params are parsed with a tolerant schema → **safe defaults** on bad input (never crash on a hand-edited URL); the canonical view-state stays in the URL (IA §3.3).

## 11. Error formatting & mapping
`formatZodError(err)` → `{ field: message }`; forms map server `fields` back via `setError`; a top-level `FormStatus` shows non-field errors.

## 12. Security
- Re-validate server-side; enforce **payload size limits** and **enum allowlists**; **rate-limit** OTP/forms per number+IP (acceptance-criteria §1.6 — enforced in the backend layer).
- Never reflect raw input into HTML; parameterize all (future) DB queries.

## 13. Testing
Unit-test schemas (valid/invalid/edge: Persian digits, `+98`, off-by-one OTP), domain rules (freshness/movement boundaries), and `validateBody` (400 shape). Vitest.

## 14. File map
```
lib/validation/  messages.ts · schemas.ts · api.ts · request.ts · domain.ts · env.ts · utils.ts
```

*Poladin — اول مشورت، بعد خرید.*
