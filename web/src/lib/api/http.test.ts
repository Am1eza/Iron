import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpRequest, httpUpload, setUnauthorizedHook } from './http';
import { ApiError } from './errors';
import { UPLOAD_RETRIES, UPLOAD_TIMEOUT_MS } from './config';

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

    await expect(httpRequest('/api/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(
      ApiError,
    );
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
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const err = await httpUpload('/api/admin/upload', file).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(
      'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
    );
  });
});

/**
 * The admin panel is used from inside Iran over a domestic link that drops for
 * a second or two; the upload payload is already compressed to WebP ≤1920px, so
 * the realistic failure is a blip, not a slow transfer. Retrying is only ever
 * correct for a fetch that never reached the server.
 */
describe('httpUpload — network retry', () => {
  const originalFetch = global.fetch;
  const file = () => new File(['x'], 'x.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    setUnauthorizedHook(null);
  });
  afterEach(() => {
    global.fetch = originalFetch;
    setUnauthorizedHook(null);
  });

  it('rides out a dropped connection: a failing-then-succeeding fetch now resolves', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { url: '/uploads/x.webp' }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await httpUpload<{ url: string }>('/api/admin/upload', file());

    expect(result.url).toBe('/uploads/x.webp');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('gives up after UPLOAD_RETRIES with the unchanged connection message', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await httpUpload('/api/admin/upload', file()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe(
      'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1 + UPLOAD_RETRIES);
  });

  it('does NOT retry a 4xx — a file the server rejected fails the same way every time', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(413, { error: 'too_large', message: 'حجم فایل زیاد است.' }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await httpUpload('/api/admin/upload', file()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(413);
    expect((err as ApiError).message).toBe('حجم فایل زیاد است.');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 5xx either — the server answered, so the link is not the problem', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(500, { message: 'خطای سرور' }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await httpUpload('/api/admin/upload', file()).catch((e: unknown) => e);

    expect((err as ApiError).status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the 401 recovery retry separate from the network retry', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'وارد نشده‌اید.' }))
      .mockResolvedValueOnce(jsonResponse(200, { url: '/uploads/x.webp' }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const hook = vi.fn().mockResolvedValue(true);
    setUnauthorizedHook(hook);

    const result = await httpUpload<{ url: string }>('/api/admin/upload', file());

    expect(result.url).toBe('/uploads/x.webp');
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
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
      headers: {
        get: (h: string) => (h.toLowerCase() === 'retry-after' ? (retryAfter ?? null) : null),
      },
      json: async () => ({
        error: 'rate_limited',
        message: 'درخواست‌ها بیش از حد است. کمی بعد دوباره تلاش کنید.',
      }),
    }) as unknown as Response;

  it('exposes delta-seconds from the header', async () => {
    global.fetch = vi.fn().mockResolvedValue(rateLimited('300')) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSeconds).toBe(300);
  });

  it('is undefined when the header is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue(rateLimited()) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('ignores a malformed (HTTP-date) value rather than guessing', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(rateLimited('Wed, 21 Oct 2026 07:28:00 GMT')) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('survives a Response double with no headers at all', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response) as unknown as typeof fetch;
    const err = (await httpRequest('/api/ai/chat', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });
});

describe('httpRequest — cancellation and cleanup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not fetch when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(httpRequest('/api/categories', { signal: controller.signal })).rejects.toBe(
      controller.signal.reason,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an in-flight request without retrying or replacing its reason', async () => {
    const controller = new AbortController();
    const fetchSpy = vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const request = httpRequest('/api/categories', { signal: controller.signal });
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['network', 'server'])('cancels during %s retry backoff immediately', async (failure) => {
    const controller = new AbortController();
    const fetchSpy =
      failure === 'network'
        ? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        : vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal('fetch', fetchSpy);
    const request = httpRequest('/api/categories', { signal: controller.signal });
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 400])('removes the caller abort listener after HTTP %s', async (status) => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(status, {})));
    await httpRequest('/api/categories', { signal: controller.signal }).catch(() => {});
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still retries transient network failures', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    const request = httpRequest('/api/categories');
    await vi.advanceTimersByTimeAsync(400);
    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('httpRequest — response boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not refetch a response rejected by its schema', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(200, { price: 'invalid' }));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      httpRequest('/api/market', {
        schema: {
          parse: () => {
            throw new Error('schema');
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not refetch malformed JSON', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => {
        throw new SyntaxError('invalid JSON');
      },
    });
    vi.stubGlobal('fetch', fetchSpy);
    await expect(httpRequest('/api/market')).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout active while reading a response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
                once: true,
              });
            }),
        }),
      ),
    );
    const request = httpRequest('/api/market', { retries: 0, timeoutMs: 100 });
    const assertion = expect(request).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('httpUpload — total timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares the time budget across retries instead of granting each a new minute', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new TypeError('connection lost')), UPLOAD_TIMEOUT_MS - 1000),
          ),
      )
      .mockImplementation(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal('fetch', fetchSpy);
    const request = httpUpload('/api/admin/upload', new File(['x'], 'x.jpg'));
    const assertion = expect(request).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels retry backoff when the shared deadline expires', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(
      () =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new TypeError('connection lost')), UPLOAD_TIMEOUT_MS - 100),
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const request = httpUpload('/api/admin/upload', new File(['x'], 'x.jpg'));
    const assertion = expect(request).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
