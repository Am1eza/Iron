# شمش فولاد (billet) — from admin-entered to automatically polled

**Branch:** `worktree-billet-automation` · **Story:** US-05.x (نبض بازار ticker)

## Why

`billet` was the one ticker key with no feed. It sat at **60,800 تومان/kg from
1405/05/25** while the real market ran **66,750–67,700** — a ~10% error that
stood for a week on a site whose entire positioning is price transparency,
purely because nothing automated tracked it and nobody remembered to type it.
(The live value and the historical `market_points` backfill from 2026-08-16
onward were already corrected by hand before this branch; this is the
make-it-self-sustaining half.)

## The source

`esfahanahan.com` — a real Iranian steel retailer — backs its product-page
price chart with:

```
GET /api/products/variations/prices/{productId}?source={from}&destination={to}
→ {"success":true,"data":[[unixSeconds, priceInRial], ...]}
```

Product **626** is شمش فولاد ۱۵۰×۱۵۰ اصفهان (القایی، 5SP، ۱۲ متری), the same
grade the ticker's billet number has always referred to.

It is **not** a documented/public API — it's the endpoint behind their own chart
widget. No auth, no key, no published rate limit. Both are configurable
(`ESFAHANAHAN_BASE_URL`, `ESFAHANAHAN_BILLET_PRODUCT_ID`) so a change upstream
is an env edit, not a deploy of new code.

**Verified server-side before building on it** (the brief's DNS worry):

| check | result |
|---|---|
| plain `curl` from the host | HTTP 200, real data, ~55 ms |
| `https.get` with plain `getaddrinfo` **inside `ahantime-web-1`** (Alpine/musl) | HTTP 200 in 827 ms — **no musl bug for this host** |
| `dns.resolve4('esfahanahan.com')` inside the container | `185.143.234.238`, `185.143.233.238` |

So the musl `getaddrinfo` failure that bites `gold-api.com` does **not**
reproduce here. The `dns.resolve4` workaround is reused anyway — it costs
nothing, works, and means one code path instead of two for outbound JSON.
To avoid a second copy of it, `fetchJson` + `UpstreamHttpError` +
`isRetryableHttpError` were **moved verbatim** out of `tgju.ts` into
`src/lib/server/utils/httpJson.ts`; both integrations now import it. `tgju.ts`
is otherwise untouched and its 8 existing tests still pass unchanged.

Unit: values are **Rial**; stored as **Toman = Rial / 10**, matching every other
Toman key and every billet value ever entered by hand. There is a test asserting
677,000 ﷼ → 67,700 تومان specifically because a missing `/10` here is the
155×-overcharge class of bug — this number feeds auto-quoting downstream.

## Decision 1 — `source` typing: a third value, not reused `'tgju'`

`MARKET_SOURCES` is now `['tgju', 'esfahanahan', 'admin']` (and the matching
`MarketValue['source']` union in `domain.ts`).

**No migration is needed.** `market_values.source` is plain `text` in
`drizzle/0000_init.sql` — no PG enum, no check constraint; the enum lives only
in the Drizzle/TS layer. `drizzle-kit generate` was deliberately not run (the
journal is a known cross-agent collision point and there is no SQL to emit).

Every reader of `source` was checked before deciding:

- `MarketBoard.tsx` renders the **same badge regardless of `source`** (a
  deliberate 2026-08-15 layout decision), so a new value changes nothing visually.
- `flagTgjuStale()` was the only behavioural reader — `UPDATE … WHERE source =
  'tgju'`. **That's exactly why reusing `'tgju'` would have been wrong:** a tgju
  outage would have badged the billet row «با تأخیر» even though esfahanahan was
  fine, and — worse — an esfahanahan outage would have been invisible, leaving
  billet silently stuck again, the precise failure this work exists to end.

So it's generalized to `flagSourceStale(source)`, with `flagTgjuStale()` kept as
a one-line wrapper (`catalog.test.ts` and `alerts.service.ts` comments reference
it). A generic `'auto'` was rejected for the same reason: it would merge the two
feeds' outage domains back together.

## Decision 2 — polling interval: 15 minutes, its own job

`billetPollJob` (`CONSTANTS.BILLET_REFRESH_SECONDS = 900`), registered in
`jobs/index.ts`, offset 20 s from startup so the two feeds don't tick together.

The 60 s `TICKER_REFRESH_SECONDS` cadence exists for FX and gold, which move
minute to minute. Billet is a B2B retailer's published price: a live 7-day
window pulled during this work returned **2 points in 48 hours**. Polling that
every 60 s would be ~1,440 requests/day at an undocumented third-party endpoint
to observe maybe three changes — rude, and a good way to get blocked. 15 min is
~96 requests/day and keeps the ticker within a quarter hour of the source, which
is well inside the **5-minute ISR window** of the pages that quote the billet
reference (`/prices/[category]/[sub]/[sku]`, `revalidate = 300`) — so no extra
`revalidatePath` wiring is needed, and it is four orders of magnitude tighter
than the week of staleness it replaces. Price alerts are likewise already
covered: `alertsJob` evaluates every 60 s independently of which feed wrote.

The request window itself is **7 days wide**, not one day: a quiet weekend or a
holiday leaves gaps, and a wide window makes that read as "unchanged" (we take
the newest point) rather than as an outage. Points are sorted rather than
trusted to be ascending — taking the wrong end would pin the ticker to a
week-old price.

On the secondary Cloudflare Workers target, `cronRunner.ts` only has three fixed
Cron Triggers, so `billetPollJob` rides the 10-minute one. Slightly more often
than Docker; harmless, where every-minute would not be.

## Decision 3 — `PUT /api/admin/market/billet` stays, as a *bounded* override

Kept, not deleted. The owner sometimes has a better number than the feed (a mill
quote off a phone call, or the feed publishing something obviously wrong), and
deleting the route would remove the only way to act on that.

But left naive, the route would be decorative — the next poll would silently
revert it minutes later with no error and no trace. So an admin write now gets a
**hold window**: `refreshBillet()` skips the poll entirely (no upstream request
either) while the row is `source='admin'` and younger than
`BILLET_ADMIN_HOLD_HOURS` (**default 6h**; `0` disables the hold and lets the
feed always win).

Bounded deliberately. "Billet is whatever a human last typed" is the failure
being fixed — after the hold the feed takes back over on its own, so a forgotten
override can go stale by at most 6 hours instead of indefinitely.

## Decision 4 — outage / stale handling

Identical posture to the other four keys (AC-A-2), scoped per feed:

| situation | behaviour |
|---|---|
| esfahanahan unreachable / 5xx / bad shape / empty window | `fetchBilletPrice()` returns `null` (**never throws**), `flagSourceStale('esfahanahan')` → last-known billet value keeps serving with the outage badge |
| esfahanahan down, billet currently on an **admin** override | row is **not** flagged stale — the feed being down says nothing about a hand-entered number |
| tgju down | billet untouched (different source), and vice versa |
| transient 5xx / network error | `withResilience`: 2 retries, 300 ms base backoff; a 4xx (e.g. wrong product id) fails immediately — retrying won't fix it |
| repeated failure | circuit breaker opens after 3 consecutive failures, skipping the network for 30 s |
| timeout | 10 s (a retailer CMS, not a dedicated price API; nothing user-facing waits on it) |

## Files

```
web/src/lib/server/utils/httpJson.ts            NEW  (moved out of tgju.ts)
web/src/lib/server/integrations/esfahanahan.ts  NEW
web/src/lib/server/integrations/esfahanahan.test.ts   NEW  (9 tests)
web/src/lib/server/jobs/billetPoll.job.ts       NEW
web/src/lib/server/services/market.billet.pg.test.ts  NEW  (7 tests)
web/src/lib/server/services/market.service.ts   refreshBillet() + per-source stale flagging
web/src/lib/server/repos/marketRepo.ts          flagSourceStale(); flagTgjuStale() → wrapper
web/src/lib/server/db/schema/market.ts          MARKET_SOURCES += 'esfahanahan'
web/src/lib/types/domain.ts                     MarketValue['source'] union
web/src/lib/config/constants.ts                 BILLET_REFRESH_SECONDS = 900
web/src/lib/server/jobs/index.ts · cronRunner.ts    register billetPollJob
web/src/app/api/admin/market/billet/route.ts    doc: override + hold semantics
web/src/app/api/market/route.ts · components/market/MarketBoard.tsx    stale comments corrected
```

The "Billet is admin-entered and never touched here" comment in
`market.service.ts` is gone, along with the same claim in `schema/market.ts`,
`api/market/route.ts`, `marketPoll.job.ts` and `MarketBoard.tsx`'s two comments.

## Verification run

- `tsc --noEmit` — clean (the 3 `ahantime-logo.png` module errors are
  pre-existing on `main`; they come from build-generated image typings).
- `next lint` on all 11 touched files — clean.
- `next build` — succeeds.
- Targeted vitest: **17 passed** (`esfahanahan.test.ts` 9 + `tgju.test.ts` 8 —
  the moved `fetchJson` breaks nothing), **7 passed**
  (`market.billet.pg.test.ts`), **29 passed** (`catalog.test.ts`,
  `marketRepo.movement.pg.test.ts`, `cleanupMarketPoints.pg.test.ts`).
  The full suite is left to CI (OOM risk on this box).

Integration tests hit **real local HTTP servers** on `127.0.0.1` rather than a
mocked `fetch`, matching `tgju.test.ts` — `fetchJson` uses `node:http(s)` with a
custom DNS `lookup`, so mocking `fetch` would test nothing real.

## After merge — live checks

```bash
curl -sk --resolve ahantime.com:443:127.0.0.1 https://ahantime.com/api/market \
  | python3 -m json.tool | grep -A6 billet          # source: "esfahanahan", isStale: false

docker exec ahantime-db-1 psql -U ahantime -d ahantime -c \
  "select value, at from market_points where key='billet' order by at desc limit 5;"
```

New `market_points` rows should appear with no manual action, at most one per
actual upstream reprice (`upsertMarketValue` skips no-change points by design,
so a flat day correctly adds nothing).
