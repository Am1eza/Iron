# Ahantime Web — Error Handling
## Layer 4 · Frontend — Document 7 (Error Handling)

**Version:** 1.0 · 26 June 2026
**Builds on:** `API-CLIENT.md`, `VALIDATION.md`, `design/empty-states.md`, `design/accessibility.md`.
**Purpose:** One coherent error strategy — every failure becomes a calm, Persian, recoverable state (never a dead-end, never a raw/English error), with centralized logging and graceful degradation.

## 1. Principles
1. **Errors are designed states** (empty-states doc) — not blank screens or stack traces.
2. **Persian + recoverable.** Always a friendly message + a way forward (**retry / alternative / contact**). Never English, never a stack.
3. **Fail scoped.** One failing widget shows its own error; the page keeps working.
4. **Degrade gracefully.** tgju/AI/backend down → last-known data or a callback offer, not a crash.
5. **Log everything (server-side); expose nothing.** Raw errors go to monitoring; users see safe copy.
6. **Announced & accessible** — `role="alert"`, focus management.

## 2. Error Taxonomy
| Type | Source | Handling |
|---|---|---|
| **Validation** | form / request body | field + form errors (Zod) |
| **API / network** | `ApiError` (4xx/5xx/timeout/offline) | `toUserMessage` → inline/toast + retry |
| **Auth** | 401 / session | redirect to `/ورود?next=` |
| **Not found** | bad slug | `notFound()` → branded 404 |
| **Render / runtime** | component throw | route `error.tsx` / `ErrorBoundary` |
| **Root layout** | layout/provider throw | `global-error.tsx` |
| **AI / relay** | DeepSeek down | graceful message + «ثبت درخواست» |
| **External data** | tgju/backend bad data | boundary parse → fallback (`isStale`) |

## 3. Handling Layers
| Layer | Mechanism |
|---|---|
| **Route segment** | `app/**/error.tsx` (client boundary, Persian retry) — already global at `app/error.tsx` |
| **Root layout** | `app/global-error.tsx` (renders own html/body; self-contained styles) |
| **Component / widget** | `<ErrorBoundary>` (class) → `<ErrorState onRetry>` — isolates ticker/chart/table |
| **Data (Query)** | `useQuery` `error` state → `ErrorState`; `QueryCache`/`MutationCache` `onError` → `reportError` |
| **Form** | field errors + `FormStatus` (+ server `fields` → `setError`) |
| **Server route** | consistent `{ error, message, fields }` JSON (validation 400, others 4xx/5xx) |
| **Boundary/external** | `parseOr` fallback; `isStale` indicators |
| **Not found** | `notFound()` → `not-found.tsx` |

## 4. Display Patterns (when to use each)
- **Field error** — invalid input (inline, `aria-describedby`).
- **`FormStatus`** — form-level success/failure (in-flow).
- **`ErrorState`** — a section/widget failed to load → message + **retry** (scoped).
- **`Toaster`** — transient/background failures & confirmations (auto-dismiss, `aria-live`; errors `role="alert"`).
- **Route `error.tsx`** — a whole page render failed → full-page retry.
- **`global-error.tsx`** — the shell itself failed (rare).
- **404 `not-found.tsx`** — missing resource (no dead-ends: search/categories/AI/home).

## 5. Retry & Recovery
- GET data auto-retries (API client: 5xx/network, backoff). UI retry re-runs the query/mutation; **drafts/inputs are preserved**.
- `QueryErrorResetBoundary` resets failed queries on retry.
- Auth errors → login with `next` so the user returns to where they were.

## 6. Graceful Degradation
- **Ticker / طلا و ارز:** tgju fail → last-known values + «با تأخیر» (never empty).
- **AI:** relay/timeout → calm message + «ثبت درخواست/تماس با کارشناس» (creates a lead) — never a blank chat.
- **Price:** stale/missing → real date or «تماس بگیرید» — never a false fresh number.
- **Widget isolation:** a failed chart/section never blanks the page (its own `ErrorBoundary`).

## 7. Logging & Monitoring (`lib/errors/report.ts`)
- `reportError(error, context)` — **server:** structured `console.error` (→ monitoring sink later); **client:** console now, `sendBeacon('/api/log')` later.
- **Redact PII** (mobile/lead data) from logs; **never** include user input verbatim in client-visible messages.
- Hooked into `QueryCache`/`MutationCache` `onError` and the boundaries.

## 8. Query / Mutation pattern
```ts
const q = useQuery({ queryKey, queryFn });
if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
// mutations: handle UI locally (FormStatus/toast); global onError only logs (no double-notify)
```

## 9. Accessibility
- Error regions: `role="alert"` (assertive) for blocking, `role="status"` (polite) for info; focus moves to page-level errors; color never the only signal (icon + text).

## 10. Security
- No stack/PII/secret in any client response or message; server maps internals to safe Persian copy; 500s never leak details.

## 11. Testing
- Boundaries render fallback on throw; `ApiError` → correct copy; offline/timeout paths; tgju/AI degradation; 404; a11y of alerts.

## 12. File map
```
app/error.tsx · app/global-error.tsx · app/not-found.tsx
components/feedback/ ErrorBoundary.tsx · ErrorState.tsx · Toaster.tsx (+css)
lib/errors/report.ts · lib/api/errors.ts (ApiError/toUserMessage)
lib/query/queryClient.ts (cache onError → reportError)
```

*Ahantime — اول مشورت، بعد خرید.*
