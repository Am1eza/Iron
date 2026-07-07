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

    sendToSentry('Error', 'boom', undefined);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts a valid envelope to the parsed ingest URL when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/9');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { sendToSentry } = await import('./sentry');

    sendToSentry('Error', 'boom', 'Error: boom\n    at foo', { scope: 'test' });
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

    expect(() => sendToSentry('Error', 'boom', undefined)).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('reportError PII scrubbing (regression: mobile must not leak to logs/Sentry)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('scrubs a mobile embedded in the error MESSAGE and STACK from the log line and Sentry', async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/9');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reportError } = await import('./report');

    const err = new Error('no user for 09121234567');
    reportError(err, { note: 'ref for +989887776655' });
    await Promise.resolve();

    // Log line: neither message nor stack may contain the raw 11-digit mobile.
    const logged = errSpy.mock.calls[0]![0] as string;
    expect(logged).not.toMatch(/09121234567/);
    expect(logged).not.toMatch(/989887776655/);
    expect(logged).toContain('[redacted-mobile]');

    // Sentry event value (message + stack) must also be scrubbed.
    const body = fetchSpy.mock.calls[0]![1].body as string;
    expect(body).not.toMatch(/09121234567/);
    expect(body).not.toMatch(/989887776655/);
  });
});
