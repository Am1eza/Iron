import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('sendToSentry', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('no-ops (never calls fetch) when SENTRY_DSN is unset', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { sendToSentry } = await import('./sentry');

    sendToSentry(new Error('boom'));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts a valid envelope to the parsed ingest URL when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/9');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { sendToSentry } = await import('./sentry');

    sendToSentry(new Error('boom'), { scope: 'test' });
    // fire-and-forget: give the microtask a tick before asserting.
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://o1.ingest.sentry.io/api/9/envelope/?sentry_key=abc123&sentry_version=7');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-sentry-envelope');

    const lines = (init.body as string).trim().split('\n');
    expect(lines).toHaveLength(3);
    const event = JSON.parse(lines[2]!);
    expect(event.exception.values[0].type).toBe('Error');
    expect(event.exception.values[0].value).toContain('boom');
    expect(event.extra).toEqual({ scope: 'test' });
  });

  it('never throws when the DSN is malformed', async () => {
    vi.stubEnv('SENTRY_DSN', 'not-a-valid-url');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { sendToSentry } = await import('./sentry');

    expect(() => sendToSentry(new Error('boom'))).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
