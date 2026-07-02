# AI — the grounded advisor (مشاور هوشمند)

How the AI advisor works, why it can never invent a number, and how to run it
cheaply. Implements `product/acceptance-criteria.md §D`.

## Architecture

```
AdvisorChat (client)
  │  POST /api/ai/chat  {messages:[{role:'user'|'ai', text}]}   (SSE back)
  ▼
/api/ai/chat (route) ── zod validation · rate limit · 503 when unconfigured
  ▼
lib/server/ai/engine.ts ── the agent loop
  │   ├─ deepseek.ts   fetch client → DeepSeek via the out-of-Iran relay
  │   ├─ tools.ts      get_prices · calc_weight · estimate_project · compare_factories
  │   ├─ grounding.ts  ledger + post-generation numeric validator
  │   └─ prompt.ts     ONE byte-stable system prompt (cache-friendly)
  ▼
SSE events: delta │ card (estimate/split) │ chips │ done │ error
```

The client keeps the local rule engine as a zero-cost fallback: mock mode,
relay outage, rate-limit and validation failures all degrade to it silently —
the advisor never dead-ends (AC-D-9).

## The grounding guarantee (AC-D-3)

1. **Tools decide every number.** The four tools read the same catalog the
   price tables render. Every number in every tool result is recorded in a
   per-request `GroundingLedger` (including «هزار/میلیون» scaled forms).
2. **The model's final text is buffered — not streamed raw.** Before anything
   reaches the user, `sanitizeGrounded` scans it: any price/weight/cost-sized
   number (or any number glued to تومان/ریال/هزار/میلیون/کیلوگرم/گرم) that is
   not in the ledger and was not typed by the user is a violation.
3. **One strict retry, then censorship.** On a violation the model gets one
   corrective round; if it still misbehaves, the invented figures are replaced
   with «قیمت دقیق را کارشناس اعلام می‌کند». Only validated text is then
   re-chunked to the client as a stream.
4. **Arithmetic is code, not the model** (BR-D3.2): totals in
   `estimate_project` / `compare_factories` are computed server-side.

The adversarial QA set (`lib/server/ai/ai.test.ts`) covers 30+ smuggling
disguises — separators, digit scripts, scaled forms, ranges, ریال, decimals —
and asserts zero ungrounded numbers survive (DoD-D).

## Conversation policy (AC-D-2)

- Bare price ask («قیمت آهن چنده؟») → the advisor asks the purpose first.
- Precise ask («میلگرد ۱۴ A3») → answers directly from `get_prices`.
- Project inputs → targeted follow-ups, then `estimate_project` (labelled تخمینی).
- Off-topic → polite redirect; internals are never revealed (AC-D-8).

## Cost controls

| Lever | Implementation |
|---|---|
| DeepSeek context caching | `SYSTEM_PROMPT` is one static string — never interpolated; cache-hit input is ~1/10 the price |
| History trim | client sends last 10 turns; server re-trims (count + chars) — `CONSTANTS.AI_HISTORY_*` |
| Token caps | explicit `max_tokens` every round — `CONSTANTS.AI_MAX_TOKENS` |
| Compact payloads | short tool schemas; `get_prices` returns top-8 rows only |
| Model tier | `deepseek-chat` (non-thinking) — enough for tool routing |
| Abuse guard | per-client rate limit — `CONSTANTS.AI_RATE_LIMIT_*` |
| Zero-cost fallback | mock mode / outages answer locally, no API call |

## Configuration

| Var | Meaning |
|---|---|
| `DEEPSEEK_API_KEY` | relay key (server-only) |
| `DEEPSEEK_BASE_URL` | OpenAI-compatible relay base, e.g. `https://relay/v1` |
| `DEEPSEEK_MODEL` | default `deepseek-chat` |
| `NEXT_PUBLIC_API_MODE` | `live` activates the server advisor; `mock` keeps the local engine |

Without the `DEEPSEEK_*` vars the route answers `503 ai_unconfigured` and the
client silently uses the local engine.

## Swapping mock → live catalog

`tools.ts` imports from `lib/mock/catalogData`. When the backend lands, point
those reads at the live price service — the grounding pipeline is unchanged.
