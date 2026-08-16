import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpRequest, httpUpload, setUnauthorizedHook } from './http';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('httpRequest — 401 recovery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setUnauthorizedHook(null);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHook(null);
  });

  it('retries once after the hook reports a successful recovery', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'وارد نشده‌اید.' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(true);
    setUnauthorizedHook(hook);

    const result = await httpRequest('/api/admin/leads');

    expect(result).toEqual({ ok: true });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries only once even if the retried request also 401s', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'وارد نشده‌اید.' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(true);
    setUnauthorizedHook(hook);

    await expect(httpRequest('/api/admin/leads')).rejects.toBeInstanceOf(ApiError);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws immediately when the hook fails to recover the session', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'وارد نشده‌اید.' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(false);
    setUnauthorizedHook(hook);

    await expect(httpRequest('/api/admin/leads')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('never invokes the hook for /api/auth/* itself, to avoid a refresh recursively retrying its own failure', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'no_session' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(true);
    setUnauthorizedHook(hook);

    await expect(httpRequest('/api/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(hook).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('with no hook registered, a 401 throws directly (unchanged pre-existing behavior)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'وارد نشده‌اید.' }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(httpRequest('/api/admin/leads')).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('httpUpload — 401 recovery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setUnauthorizedHook(null);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHook(null);
  });

  it('retries the upload once after the hook recovers the session', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'وارد نشده‌اید.' }))
      .mockResolvedValueOnce(jsonResponse(200, { url: '/uploads/x.jpg' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(true);
    setUnauthorizedHook(hook);

    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const result = await httpUpload<{ url: string }>('/api/admin/upload', file);

    expect(result.url).toBe('/uploads/x.jpg');
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when the hook fails to recover the session', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'وارد نشده‌اید.' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    setUnauthorizedHook(vi.fn().mockResolvedValue(false));

    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    await expect(httpUpload('/api/admin/upload', file)).rejects.toBeInstanceOf(ApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('turns a raw network failure (dropped connection) into a friendly ApiError instead of an unhandled exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const err = await httpUpload('/api/admin/upload', file).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.');
  });
});

/**
 * `Retry-After` is the ONLY place the real wait is stated — the 429 JSON body
 * from `rateLimit()` says «کمی بعد» without a duration — so the AI advisor's
 * rate-limit notice has nothing to count down without this.
 */
describe('toApiError — Retry-After', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const rateLimited = (retryAfter?: string): Response =>
    ({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null) },
      json: async () => ({ error: 'rate_limited', message: 'درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.' }),
    }) as unknown as Response;

  it('exposes delta-seconds from the header', async () => {
    global.fetch = vi.fn().mockResolvedValue(rateLimited('300')) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSeconds).toBe(300);
  });

  it('is undefined when the header is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue(rateLimited()) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('ignores a malformed (HTTP-date) value rather than guessing', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(rateLimited('Wed, 21 Oct 2026 07:28:00 GMT')) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('survives a Response double with no headers at all', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });
});
