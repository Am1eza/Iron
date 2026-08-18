// @vitest-environment node
/**
 * streamCompletion wire-format tests with a mocked fetch stream (same
 * technique as smsir.test.ts): the request must opt into usage reporting
 * (stream_options.include_usage) and the final choices-less usage chunk must
 * surface as a server-side 'usage' event with numbers defaulted to 0.
 */
import { DEFAULT_AI_MODEL } from './aiRelayConfig';
import { describe, it, expect, beforeEach, vi } from 'vitest';

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(`data: ${f}\n\n`));
      controller.close();
    },
  });
}

async function collect(frames: string[]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseBody(frames) });
  vi.stubGlobal('fetch', fetchMock);
  const { streamCompletion } = await import('./aiRelay');
  const events = [];
  for await (const ev of streamCompletion([{ role: 'user', content: 'سلام' }], [])) events.push(ev);
  return { events, fetchMock };
}

describe('streamCompletion usage telemetry', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://relay.example.com');
  });

  it('requests stream_options.include_usage', async () => {
    const { fetchMock } = await collect(['[DONE]']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://relay.example.com/chat/completions');
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('caps reasoning on EVERY call, by default', async () => {
    // The current model is a reasoning model: unconstrained it spent ~95% of
    // its tokens thinking (1878 reasoning deltas vs 88 content deltas for one
    // short greeting) and could not finish a tool round trip inside
    // AI_TIMEOUT_MS — every production answer ended in a 20s timeout. Nothing
    // has to be configured for the cap to apply.
    const { fetchMock } = await collect(['[DONE]']);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).reasoning_effort).toBe('low');
  });

  it('honours an explicit AI_REASONING_EFFORT', async () => {
    vi.stubEnv('AI_REASONING_EFFORT', 'none');
    const { fetchMock } = await collect(['[DONE]']);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).reasoning_effort).toBe('none');
  });

  it('omits the field entirely when configured off — a provider may reject an unknown key', async () => {
    vi.stubEnv('AI_REASONING_EFFORT', 'off');
    const { fetchMock } = await collect(['[DONE]']);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).not.toHaveProperty('reasoning_effort');
  });

  it('the legacy DEEPSEEK_* names still reach the wire (the live .env still uses them)', async () => {
    const { fetchMock } = await collect(['[DONE]']);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://relay.example.com/chat/completions');
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer test-key');
  });

  it('the modern AI_* names take precedence', async () => {
    vi.stubEnv('AI_BASE_URL', 'https://ai.parspack.example/v1');
    vi.stubEnv('AI_API_KEY', 'modern-key');
    const { fetchMock } = await collect(['[DONE]']);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://ai.parspack.example/v1/chat/completions');
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer modern-key');
  });

  it('parses the final choices-less usage chunk (DeepSeek cache split) into a usage event', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: 'سلام! ' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'چه کمکی؟' }, finish_reason: 'stop' }] }),
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 120, completion_tokens: 40, prompt_cache_hit_tokens: 64, prompt_cache_miss_tokens: 56 },
      }),
      '[DONE]',
    ]);
    expect(events).toEqual([
      { type: 'token', text: 'سلام! ' },
      { type: 'token', text: 'چه کمکی؟' },
      { type: 'usage', usage: { promptTokens: 120, completionTokens: 40, cacheHitTokens: 64 } },
      { type: 'done' },
    ]);
  });

  it('defaults missing usage numbers to 0 (plain OpenAI shape without the cache split)', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [], usage: { prompt_tokens: 10 } }),
      '[DONE]',
    ]);
    expect(events).toContainEqual({
      type: 'usage',
      usage: { promptTokens: 10, completionTokens: 0, cacheHitTokens: 0 },
    });
  });

  it('a stream without a usage chunk yields no usage event', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: 'باشه' } }] }),
      '[DONE]',
    ]);
    expect(events.some((e) => e.type === 'usage')).toBe(false);
  });

  it('finish_reason "length" (max_tokens hit mid-answer) yields a truncated event (US-27.5)', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: 'قیمت میلگرد از کارخانه ذوب‌آهن...' }, finish_reason: 'length' }] }),
      '[DONE]',
    ]);
    expect(events).toContainEqual({ type: 'truncated' });
  });

  it('a normal "stop" finish never yields a truncated event', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: 'باشه' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]);
    expect(events.some((e) => e.type === 'truncated')).toBe(false);
  });

  /**
   * The live provider does NOT send the usage chunk choices-less: it hangs
   * `usage` off the LAST content chunk, which still carries `choices`. The
   * reader used to look for usage only inside its `if (!choice)` branch, so
   * under this provider it never fired once — all 175 ai_usage rows written
   * since the migration recorded 0/0/0, and the daily token budget that reads
   * them could not trip.
   */
  it('parses usage off a chunk that ALSO carries choices (the live Parspack shape)', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: 'سلام' } }] }),
      JSON.stringify({
        choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 1180,
          completion_tokens: 136,
          prompt_tokens_details: { cached_tokens: 512 },
        },
      }),
      '[DONE]',
    ]);
    expect(events).toContainEqual({
      type: 'usage',
      // cached_tokens is where this provider puts the number DeepSeek called
      // prompt_cache_hit_tokens; both spellings have to work.
      usage: { promptTokens: 1180, completionTokens: 136, cacheHitTokens: 512 },
    });
  });

  it('reports the VOLUME of the private reasoning channel, never its text', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { reasoning: 'User writes in Persian' } }] }),
      JSON.stringify({ choices: [{ delta: { reasoning_content: 'so answer' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'سلام' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]);
    // Both spellings counted; the deliberation itself never becomes a token
    // event, so it cannot reach the visitor by this route.
    expect(events).toContainEqual({ type: 'reasoning', chars: 'User writes in Persian'.length });
    expect(events).toContainEqual({ type: 'reasoning', chars: 'so answer'.length });
    expect(events.filter((e) => e.type === 'token')).toEqual([{ type: 'token', text: 'سلام' }]);
  });

  it('an answer that is ALL reasoning and no content yields no token event at all', async () => {
    const { events } = await collect([
      JSON.stringify({ choices: [{ delta: { content: '', reasoning: 'thinking hard' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'length' }] }),
      '[DONE]',
    ]);
    expect(events.some((e) => e.type === 'token')).toBe(false);
    expect(events).toContainEqual({ type: 'truncated' });
    expect(events).toContainEqual({ type: 'reasoning', chars: 'thinking hard'.length });
  });
});

describe('fallback relay (FALLBACK_BASE_URL + FALLBACK_API_KEY)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.stubEnv('DEEPSEEK_API_KEY', 'primary-key');
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://relay.example.com');
  });

  async function run(fetchMock: ReturnType<typeof vi.fn>, signal?: AbortSignal, userSignal?: AbortSignal) {
    vi.stubGlobal('fetch', fetchMock);
    const { streamCompletion } = await import('./aiRelay');
    const events = [];
    for await (const ev of streamCompletion([{ role: 'user', content: 'سلام' }], [], signal, userSignal))
      events.push(ev);
    return events;
  }

  function stubFallback(model?: string) {
    vi.stubEnv('FALLBACK_BASE_URL', 'https://fallback.example.com/v1');
    vi.stubEnv('FALLBACK_API_KEY', 'fallback-key');
    if (model) vi.stubEnv('FALLBACK_MODEL', model);
  }

  it('primary 500 → the SAME request retries once on the fallback (own key + model)', async () => {
    stubFallback('gpt-4o-mini');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, body: null })
      .mockResolvedValueOnce({ ok: true, body: sseBody(['[DONE]']) });
    const events = await run(fetchMock);
    expect(events).toEqual([{ type: 'done' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://fallback.example.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer fallback-key');
    const primaryBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const fallbackBody = JSON.parse(init.body);
    expect(fallbackBody.model).toBe('gpt-4o-mini');
    // Same OpenAI-compatible request — only the model may differ.
    expect(fallbackBody.messages).toEqual(primaryBody.messages);
    expect(fallbackBody.stream_options).toEqual(primaryBody.stream_options);
  });

  it('primary network throw → fallback used; FALLBACK_MODEL defaults to the primary model', async () => {
    stubFallback();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true, body: sseBody(['[DONE]']) });
    const events = await run(fetchMock);
    expect(events).toEqual([{ type: 'done' }]);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).model).toBe(DEFAULT_AI_MODEL);
  });

  it('both legs fail → throws (never a silent empty stream)', async () => {
    stubFallback();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, body: null })
      .mockResolvedValueOnce({ ok: false, status: 502, body: null });
    // W29: the thrown type is now AiUnavailableError with a classified
    // `reason`, so the route can degrade the user gracefully instead of
    // surfacing a raw error frame. The status is deliberately NOT in the
    // message — GlitchTip groups by exception value, and a varying number
    // there minted a fresh issue per status.
    await expect(run(fetchMock)).rejects.toMatchObject({
      name: 'AiUnavailableError',
      reason: 'upstream',
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no fallback configured → exactly one attempt, original error surfaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, body: null });
    await expect(run(fetchMock)).rejects.toMatchObject({
      name: 'AiUnavailableError',
      reason: 'upstream',
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [402, 'credit'],
    [401, 'auth'],
    [403, 'auth'],
  ])('a %i is refused at the ACCOUNT level — the fallback leg is not even attempted', async (status, reason) => {
    // The relay is answering 402 (credit exhausted) in production. The
    // fallback relay is configured by the same owner against the same
    // provider, so a second leg cannot fix credit or a revoked key — it only
    // spends another round trip on a request that will fail identically.
    stubFallback();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status, body: null });
    await expect(run(fetchMock)).rejects.toMatchObject({ name: 'AiUnavailableError', reason });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 429 IS retried on the fallback — rate limiting is per-relay, not per-account', async () => {
    stubFallback();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, body: null })
      .mockResolvedValueOnce({ ok: true, body: sseBody(['[DONE]']) });
    await run(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('FALLBACK_BASE_URL without FALLBACK_API_KEY is ignored (single attempt)', async () => {
    vi.stubEnv('FALLBACK_BASE_URL', 'https://fallback.example.com/v1');
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(run(fetchMock)).rejects.toThrow('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a healthy primary never touches the fallback', async () => {
    stubFallback();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseBody(['[DONE]']) });
    await run(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://relay.example.com/chat/completions');
  });

  // US-25.6: a shared request-deadline `signal` firing must NOT be treated
  // as "the user left" — only a real `userSignal` abort should skip the
  // fallback. Before this fix, `signal` was the only abort source the code
  // knew about, so a primary that hung until the deadline fired never got a
  // fallback attempt — exactly the case fallback exists for.
  describe('timeout vs. real user abort (US-25.6)', () => {
    it('primary aborted by the shared DEADLINE (signal), user still connected (userSignal not aborted) → fallback IS attempted', async () => {
      stubFallback();
      const deadline = new AbortController();
      deadline.abort(); // simulates AI_TIMEOUT_MS firing
      const userSignal = new AbortController().signal; // user never left
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
        .mockResolvedValueOnce({ ok: true, body: sseBody(['[DONE]']) });
      const events = await run(fetchMock, deadline.signal, userSignal);
      expect(events).toEqual([{ type: 'done' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]![0]).toBe('https://fallback.example.com/v1/chat/completions');
    });

    it('a REAL user abort (userSignal aborted) never touches the fallback', async () => {
      stubFallback();
      const userSignal = new AbortController();
      userSignal.abort();
      const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
      await expect(run(fetchMock, userSignal.signal, userSignal.signal)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('the fallback leg gets its OWN independent signal, not the already-aborted primary one', async () => {
      stubFallback();
      const deadline = new AbortController();
      deadline.abort();
      const userSignal = new AbortController().signal;
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
        .mockResolvedValueOnce({ ok: true, body: sseBody(['[DONE]']) });
      await run(fetchMock, deadline.signal, userSignal);
      const fallbackSignal = fetchMock.mock.calls[1]![1].signal as AbortSignal | undefined;
      expect(fallbackSignal?.aborted).toBe(false);
    });

    it('omitting userSignal reproduces the old behavior (signal.aborted skips the fallback)', async () => {
      stubFallback();
      const deadline = new AbortController();
      deadline.abort();
      const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
      await expect(run(fetchMock, deadline.signal /* no userSignal */)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
