// @vitest-environment node
/**
 * streamCompletion wire-format tests with a mocked fetch stream (same
 * technique as smsir.test.ts): the request must opt into usage reporting
 * (stream_options.include_usage) and the final choices-less usage chunk must
 * surface as a server-side 'usage' event with numbers defaulted to 0.
 */
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
  const { streamCompletion } = await import('./deepseek');
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
});

describe('fallback relay (FALLBACK_BASE_URL + FALLBACK_API_KEY)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.stubEnv('DEEPSEEK_API_KEY', 'primary-key');
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://relay.example.com');
  });

  async function run(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    const { streamCompletion } = await import('./deepseek');
    const events = [];
    for await (const ev of streamCompletion([{ role: 'user', content: 'سلام' }], [])) events.push(ev);
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
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).model).toBe('deepseek-chat');
  });

  it('both legs fail → throws (never a silent empty stream)', async () => {
    stubFallback();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, body: null })
      .mockResolvedValueOnce({ ok: false, status: 502, body: null });
    await expect(run(fetchMock)).rejects.toThrow('fallback HTTP 502');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no fallback configured → exactly one attempt, original error surfaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, body: null });
    await expect(run(fetchMock)).rejects.toThrow('deepseek HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
});
