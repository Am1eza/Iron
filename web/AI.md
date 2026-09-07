# AI — the grounded advisor (مشاور هوشمند)

How the AI advisor uses server tools and numeric grounding checks. Implements `product/acceptance-criteria.md §D`.

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

| Lever               | Implementation                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Prompt reuse        | Keep stable instructions reusable; actual caching and billing depend on the configured relay          |
| History trim        | client sends only the last 10 turns; server caps 40 msgs × 4000 chars                                 |
| Token caps          | explicit `max_tokens` on every relay round (integrations/deepseek.ts)                                 |
| Compact payloads    | short tool schemas; compact DB tool results                                                           |
| Model configuration | `AI_MODEL`, with the default defined in `aiRelayConfig.ts`; reasoning effort is explicitly controlled |
| Abuse guard         | per-IP rate limit (10 req / 5 min) — lib/server/utils/rateLimit                                       |
| Zero-cost fallback  | mock mode / outages answer locally, no API call                                                       |

## Configuration

[aiRelayConfig.ts](src/lib/server/integrations/aiRelayConfig.ts) owns provider selection and compatibility. The configured integration is Surplus Intelligence; the code default model is `gpt-5.6-luna`. These are repository settings, not a live provider availability check.

| Variable                                                           | Purpose                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `AI_BASE_URL`, `AI_API_KEY`                                        | Primary server-only relay configuration                             |
| `AI_MODEL`                                                         | Model override; defaults to `DEFAULT_AI_MODEL`                      |
| `AI_REASONING_EFFORT`                                              | Reasoning control; see the configuration helper for accepted values |
| `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` | Optional fallback relay                                             |
| `AI_ENABLED`                                                       | Enables the server advisor when required configuration is present   |
| `NEXT_PUBLIC_API_MODE`                                             | Development mock/live data choice; production rejects mock mode     |

Legacy `DEEPSEEK_*` and `FALLBACK_*` aliases remain supported for existing deployments. Prefer `AI_*` for new configuration. The integration filename `deepseek.ts` is historical and does not imply that DeepSeek is the current provider. Keep all relay keys server-only.

## Division of labour

The backend owns the tools (Postgres prices, real lead creation); this layer
owns the **grounding gate**: the route buffers each completion, feeds every
tool result into the `GroundingLedger`, sanitizes, and only then streams. The
client's local rule engine remains the zero-cost fallback for mock mode and
outages.
