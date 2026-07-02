# AI — the grounded advisor (مشاور هوشمند)

How the AI advisor works, why it can never invent a number, and how to run it
cheaply. Implements `product/acceptance-criteria.md §D`.

## Architecture

```
AdvisorChat (client)
  │  POST /api/ai/chat  {messages:[{role:'user'|'assistant', content}]}   (SSE back)
  ▼
/api/ai/chat (route) ── same-origin guard · rate limit · 503 when AI disabled
  │   agent loop (≤4 tool rounds) + grounding gate, 20s hard timeout
  ├─ lib/server/integrations/deepseek.ts  streaming relay client (max_tokens capped)
  ├─ lib/server/services/aiTools.ts       getPrice · calcWeight · estimateProject · createLead (Postgres-backed)
  └─ lib/server/ai/grounding.ts           ledger + post-generation numeric validator
  ▼
SSE frames: token │ tool │ lead │ chips │ done │ error
```

The client keeps the local rule engine as a zero-cost fallback: mock mode,
relay outage, rate-limit and validation failures all degrade to it silently —
the advisor never dead-ends (AC-D-9).

## The grounding guarantee (AC-D-3)

1. **Tools decide every number.** The tools read the same Postgres data the
   price tables render. Every number in every tool result is recorded in a
   per-request `GroundingLedger`.
2. **The model's final text is buffered — not streamed raw.** Before anything
   reaches the user, `sanitizeGrounded` scans it: any price/weight/cost-sized
   number (or any number glued to تومان/ریال/هزار/میلیون/کیلوگرم/گرم) that is
   not in the ledger and was not typed by the user is a violation.
3. **One strict retry, then censorship.** On a violation the model gets one
   corrective round; if it still misbehaves, the invented figures are replaced
   with «قیمت دقیق را کارشناس اعلام می‌کند». Only validated text is then
   re-chunked to the client as a stream.
4. **Arithmetic is code, not the model** (BR-D3.2): totals in
   `estimateProject` / `calcWeight` are computed server-side.

The scanner is scale-aware: «۳۸ هزار و ۵۰۰ تومان» evaluates to 38,500 and is
checked as a whole, «۴۵ هزار تومان» is NOT licensed by a grounded 45,000,000,
Persian/Arabic-Indic/Latin digits and ZWNJ joiners are all covered, date
patterns (۱۴۰۵/۰۴/۱۱ · 2026-06-27) are exempt data, and digit-less spelled-out
money («چهل و دو هزار تومان») is censored outright — the prompt requires digits.

The adversarial QA set (`lib/server/ai/ai.test.ts`) covers 40+ smuggling
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
| History trim | client sends only the last 10 turns; server caps 40 msgs × 4000 chars |
| Token caps | explicit `max_tokens` on every relay round (integrations/deepseek.ts) |
| Compact payloads | short tool schemas; compact DB tool results |
| Model tier | `deepseek-chat` (non-thinking) — enough for tool routing |
| Abuse guard | per-IP rate limit (10 req / 5 min) — lib/server/utils/rateLimit |
| Zero-cost fallback | mock mode / outages answer locally, no API call |

## Configuration

| Var | Meaning |
|---|---|
| `DEEPSEEK_API_KEY` | relay key (server-only) |
| `DEEPSEEK_BASE_URL` | OpenAI-compatible relay base, e.g. `https://relay/v1` |
| `DEEPSEEK_MODEL` | default `deepseek-chat` |
| `NEXT_PUBLIC_API_MODE` | `live` activates the server advisor; `mock` keeps the local engine |
| `AI_ENABLED` | `true` switches the relay on (backend flag) |

With `AI_ENABLED` false or `DEEPSEEK_*` missing the route answers `503` and the
client silently uses the local engine.

## Division of labour

The backend owns the tools (Postgres prices, real lead creation); this layer
owns the **grounding gate**: the route buffers each completion, feeds every
tool result into the `GroundingLedger`, sanitizes, and only then streams. The
client's local rule engine remains the zero-cost fallback for mock mode and
outages.
