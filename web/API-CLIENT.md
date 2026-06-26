# Fooladno Web — API Client
## Layer 4 · Frontend — Document 6 (API Client)

**Version:** 1.0 · 26 June 2026
**Builds on:** `STATE-MANAGEMENT.md`, `VALIDATION.md`, `product/data-model.md §10`.
**Purpose:** A robust, typed client layer between the UI and data — one HTTP core + resource modules, mock⇄live, boundary-validated, streaming-capable, SSR-aware.

## 1. Principles
1. **One core, many resources.** `http` (low-level) → `api.<resource>.<action>()` (typed, domain-organized).
2. **Mock ⇄ live is invisible to callers.** `NEXT_PUBLIC_API_MODE` switches inside the resource; hooks/components are identical.
3. **Resilient.** Timeouts (AbortController), retry-with-backoff for idempotent GETs, friendly Persian errors — never a raw/English failure.
4. **Validated at the boundary.** External/backend responses are parsed (Zod); bad data → graceful fallback, not a crash.
5. **SSR-aware.** Absolute base URL on the server, relative in the browser; cookies forwarded (`credentials: 'include'`).
6. **Streaming-ready.** A `stream()` path for the AI advisor (SSE/ReadableStream).

## 2. Layout
```
lib/api/
  errors.ts       ApiError + isApiError + toUserMessage
  config.ts       API_MODE · BASE_URL (server/client) · timeouts
  http.ts         the core client: httpRequest / http.{get,post,put,del,stream} · setRequestHook
  resources/      market · catalog · auth · leads · tools · ai · misc(cooperation/contact/alerts)
  index.ts        `api` barrel
  endpoints.ts    (compat) re-exports `api`
  forms.ts        `formsApi` → delegates to api.* (forms unchanged)
  client.ts       (compat shim) ApiError + API_MODE
```

## 3. The core (`http.ts`)
- `httpRequest<T>(path, opts)` — method, JSON body, headers, **timeout** (default 15s), **retries** (GET: 2, backoff), `signal` (cancellation), optional **`schema`** (validate/parse), `cache`/`next` (Next fetch caching), `credentials:'include'`.
- Convenience: `http.get/post/put/del`. **`http.stream(path, body, {signal})`** → returns the `Response` (caller reads `res.body` for AI streaming).
- **Interceptor:** `setRequestHook((init)=>…)` to attach headers (locale, future CSRF/token). Default adds `Accept-Language: fa`.
- **Errors:** non-2xx → `ApiError(status, message, { fields, code })` from the JSON body (`{ message, fields, error }`); network/timeout → `ApiError(0, 'ارتباط با سرور برقرار نشد…')`. Retries only idempotent GET on 5xx/network.

## 4. Error model (`errors.ts`)
`ApiError { status, code?, fields?, message }` · `isApiError(e)` · `toUserMessage(e)` (always a safe Persian string). Forms map `error.fields` back via `setError`; `FormStatus`/toasts show `toUserMessage`.

## 5. Resources (`api`)
| Resource | Actions |
|---|---|
| `api.market` | `list()` (ticker; ISR 60s; boundary-validated) |
| `api.catalog` | `categories()` · `table(category, sub)` · `sku(slug)` |
| `api.auth` | `requestOtp(mobile)` · `verifyOtp(mobile, code)` |
| `api.leads` | `create(payload)` |
| `api.tools` | `weight(payload)` |
| `api.ai` | `chatStream(messages, {signal})` (streaming) |
| `api.cooperation` / `api.contact` / `api.alerts` | `submit/create(...)` |
- Each: **mock** → fixtures/simulated success (`VALIDATION`-clean); **live** → `http.*` (+ boundary parse). Cancellable via `signal` (wire to TanStack Query's signal).

## 6. Integration
- **TanStack Query:** query fns call `api.*` and pass `signal` (auto-cancel on unmount). Mutations call `api.*` with optimistic updates.
- **Forms:** `formsApi` delegates to `api.auth/leads/cooperation/contact` (the form components are untouched).
- **Server (RSC):** resources are isomorphic; on the server `BASE_URL` is absolute and cookies forward for session-aware fetches.

## 7. Streaming (AI)
`api.ai.chatStream(messages, { signal })` POSTs to `/api/ai/chat` and returns the `Response`; the AI UI reads `response.body` (SSE/chunks) and appends to `aiStore`. **Grounding stays server-side** — the client only renders streamed text + tool-result payloads it receives.

## 8. Caching & revalidation
- GET resources set Next `next: { revalidate, tags }` where relevant (market 60s; tables short). Mutations don't cache. The browser Query cache layers on top.

## 9. Security
- `credentials:'include'` for the session cookie; never put secrets in client code (DeepSeek/SMS keys live in route handlers). Payloads validated server-side (`VALIDATION`). Timeouts bound hung requests.

## 10. Conventions
- Components/hooks call **`api.*`** (or `formsApi`), never `fetch` directly. New endpoints add a typed resource action + (if external) a response schema.

*Fooladno — اول مشورت، بعد خرید.*
