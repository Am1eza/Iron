# AGENT_REPORT — retry-with-backoff for the admin image upload

**Branch:** `worktree-upload-retry` · **Scope:** `web/src/lib/api/{http.ts,config.ts,http.test.ts}`

## Why

`httpUpload()` had zero retry. One dropped connection and the admin saw
«خطای برقراری ارتباط با سرور» immediately. The panel is used Iran-to-Iran over a
domestic link that blips; 48h of server logs show zero upload attempts reaching us
for the reported failures, i.e. the request dies before Caddy. Payloads are already
compressed client-side to WebP / 1920px / q0.82, so the realistic failure is a blip,
not a slow transfer — exactly the case a retry fixes.

## What changed

- `config.ts`: new `UPLOAD_RETRIES = 2` (3 attempts total), matching `DEFAULT_GET_RETRIES`.
- `http.ts`: `httpUpload()` restructured into a `for(;;)` loop, same shape as `httpRequest()`,
  reusing the existing `backoff()` helper (400ms, then 800ms — ~1.2s of added wait in the
  worst case).
  - `doUpload()` no longer swallows the fetch rejection; it just rethrows. It already built
    its own `AbortController` + timer per call, so calling it again gives each attempt a
    **fresh 60s timeout** with no restructuring needed. The `finally { clearTimeout }` stays.
  - The `ApiError(0, 'ارتباط با سرور برقرار نشد…')` throw moved to the exhausted-retries
    branch. Message and status are **unchanged** — this reduces how often it appears, not
    what it says.
  - **Total wall-clock budget:** a retry only happens while
    `Date.now() - startedAt < UPLOAD_TIMEOUT_MS`. So a blip that fails in 2s retries; a
    request that burned the whole 60s timeout is *not* retried into a 3-minute freeze — it
    fails exactly as it does today. This is what makes 2 retries safe for a user-facing path.
  - The 401 recovery hook stays a separate, exactly-once retry, now guarded by `authRetried`
    (the loop needs the guard the old straight-line code got for free). It neither consumes
    nor is consumed by the network retry budget.

## Retry only on raw fetch failure — how that's verified

Retry lives in the `catch` around `await doUpload()`, which only fires when `fetch()` itself
rejects. Any `Response` — 4xx or 5xx — leaves that catch behind and falls through to
`if (!res.ok) throw await toApiError(res)` on the first pass. Tests pin it:

- `does NOT retry a 4xx …` — a 413 `too_large` throws `ApiError(413, 'حجم فایل زیاد است.')`
  with `fetch` called **exactly once**. A file the server rejected is not re-uploaded 3×.
- `does NOT retry a 5xx either …` — 500, one fetch call.
- `rides out a dropped connection …` — reject-then-200 now **resolves** (previously threw).
- `gives up after UPLOAD_RETRIES …` — `1 + UPLOAD_RETRIES` calls, then the same
  `ApiError(0, …)` message as before.
- `keeps the 401 recovery retry separate …` — network-fail → 401 → 200 succeeds in 3 calls
  with the hook invoked once.

## UX decision: silent retry

Chosen over a «تلاش مجدد…» indicator. All three call sites already show a generic busy state
and each reports failure through its own channel (toast in `RichTextEditor` / `LetterheadForm`,
inline `error` state in `ImageUpload`); a retry signal would have to be threaded through
`adminApi.uploadImage` / `meApi.letterhead.uploadLogo` into three differently-shaped UIs.
The freeze risk that would justify that cost is removed by the total-budget guard above —
worst added wait is ~1.2s of backoff on top of attempts that themselves failed fast. Revisit
if we ever raise the retry count or drop the budget guard.

## Call sites

`httpUpload<T>(path, file)` signature and return type unchanged, so `LetterheadForm.tsx`,
`ImageUpload.tsx` and `RichTextEditor.tsx` are untouched and behave identically — their
`catch (err) { … err instanceof ApiError … }` / `finally { setUploading(false) }` blocks see
the same errors, just less often.

## Verification run

- `vitest run src/lib/api/http.test.ts` → **17 passed** (12 pre-existing + 5 new).
- `tsc --noEmit` → clean.
- `next lint` on the three touched files → no warnings or errors.
- Full suite deliberately left to CI (past OOM on this box).

> Note for anyone repeating this in a fresh worktree: `tsc` reports 3 spurious
> `Cannot find module '…/ahantime-logo.png'` errors until `web/.next` exists. They vanish
> with the main checkout's `.next` linked in, and are unrelated to this change.
