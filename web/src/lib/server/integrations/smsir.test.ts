// @vitest-environment node
/**
 * Same verified-wire-format regression as auth/sms.test.ts, for the bulk
 * free-text send path — see that file's header comment for how the shape
 * was confirmed against the real official SDK source.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';

describe('sendSms (bulk)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    resetCircuitBreakers();
  });

  it('dev/unconfigured: logs and returns ok without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    const result = await sendSms('09120000000', 'سلام', 'generic');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('production + missing credentials: fails closed instead of faking a send', async () => {
    // The outage shape: callers told the rep «پیامک شد» off a {ok:true} that
    // never touched the network. In production that must be a loud failure.
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    const result = await sendSms('09120000000', 'سلام', 'proforma');

    expect(result).toEqual({ ok: false, permanent: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('production + API key but NO line number: still fails closed (free-text is dead)', async () => {
    // The exact asymmetry that hid the outage — OTP rides the verify endpoint
    // and needs no line, so an API key alone looks "configured".
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام', 'alert')).toEqual({ ok: false, permanent: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live mode calls the exact verified SMS.ir bulk-send API shape', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, message: 'ok', data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    const result = await sendSms('09120000000', 'کد پیگیری: PF-1', 'proforma');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.sms.ir/v1/send/bulk');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': 'test-key',
    });
    expect(JSON.parse(init.body)).toEqual({
      lineNumber: 3000123456,
      MessageText: 'کد پیگیری: PF-1',
      Mobiles: ['09120000000'],
      SendDateTime: null,
    });
  });

  it('treats a non-1 status in the response body as a failure, keeping its message', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 2, message: 'rejected' }) }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendSms } = await import('./smsir');

    // Not permanent: an envelope-level refusal (credit, moderation) can clear
    // without a code/config change, unlike a 4xx on the request itself.
    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false });
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('rejected');
    errSpy.mockRestore();
  });

  it('treats a non-ok HTTP response as a failure (after exhausting its 1 retry on 5xx)', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null });
      vi.stubGlobal('fetch', fetchMock);
      const { sendSms } = await import('./smsir');

      const p = sendSms('09120000000', 'سلام');
      await vi.runAllTimersAsync();
      expect(await p).toEqual({ ok: false });
      expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry (5xx is retryable)
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a transient 5xx and succeeds on the next attempt', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 1 }) });
      vi.stubGlobal('fetch', fetchMock);
      const { sendSms } = await import('./smsir');

      const p = sendSms('09120000000', 'سلام');
      await vi.runAllTimersAsync();
      expect(await p).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a 4xx — fails immediately with a single fetch call', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => null });
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false, permanent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the provider\'s own explanation of a 400, not just the status', async () => {
    // The production outage verbatim: a wrong SMSIR_LINE_NUMBER 400s every
    // free-text send, and SMS.ir says exactly why in the body — which used to
    // be dropped on the floor, leaving only «sms.ir 400» to debug from.
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '9999999999');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ status: 20, message: 'شماره خط ارسال معتبر نیست', data: null }),
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false, permanent: true });
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('شماره خط ارسال معتبر نیست');
    expect(logged).toContain('400');
    errSpy.mockRestore();
  });

  it('never leaks the API key or the recipient mobile into the reported error', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'super-secret-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal(
      'fetch',
      // Worst case: the provider echoes the recipient back at us in the reason.
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ message: 'mobile 09121234567 is blocked' }),
      }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendSms } = await import('./smsir');

    await sendSms('09121234567', 'سلام');
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('super-secret-key');
    expect(logged).not.toContain('09121234567');
    expect(logged).toContain('[redacted-mobile]');
    errSpy.mockRestore();
  });

  it('falls back to a non-JSON error body (SMS.ir sometimes answers with an HTML page)', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '<html>Forbidden</html>' }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false, permanent: true });
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('Forbidden');
    errSpy.mockRestore();
  });

  it('a 429 is NOT permanent — the retry loop must keep it', async () => {
    // permanent:true tells schedulers to stop; a rate limit is precisely the
    // failure that DOES clear on its own, so it must never carry the flag.
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'too many' }));
      const { sendSms } = await import('./smsir');

      const p = sendSms('09120000000', 'سلام');
      await vi.runAllTimersAsync();
      expect(await p).toEqual({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a 5xx is NOT permanent — the provider may well recover', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'upstream down' }));
      const { sendSms } = await import('./smsir');

      const p = sendSms('09120000000', 'سلام');
      await vi.runAllTimersAsync();
      expect(await p).toEqual({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a 429 (rate limit) and succeeds on the next attempt', async () => {
    // Real evidence for this one: the delivery-watchdog fallback (sms.ts)
    // calls this endpoint ~30s after the Verify send, in a burst pattern a
    // rate limiter reacts to — production sms_log showed a 55% failure rate
    // on exactly this path before 429 was added to the retryable set.
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 1 }) });
      vi.stubGlobal('fetch', fetchMock);
      const { sendSms } = await import('./smsir');

      const p = sendSms('09120000000', 'سلام');
      await vi.runAllTimersAsync();
      expect(await p).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a response body that fails to parse as JSON is a failure, not a silent success', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      }),
    );
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false });
  });

  it('opens the circuit after repeated failures — a later call skips fetch entirely', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('SMSIR_API_KEY', 'test-key');
      vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null });
      vi.stubGlobal('fetch', fetchMock);
      const { sendSms } = await import('./smsir');

      // Each call retries once internally (2 attempts) but still counts as a
      // single consecutive failure toward the breaker; 3 calls here cross
      // the default failureThreshold of 3 consecutive failures.
      for (let i = 0; i < 3; i++) {
        const p = sendSms('09120000000', 'سلام');
        await vi.runAllTimersAsync();
        await p;
      }
      const callsSoFar = fetchMock.mock.calls.length;

      const result = await sendSms('09120000000', 'سلام');
      expect(result).toEqual({ ok: false });
      expect(fetchMock.mock.calls.length).toBe(callsSoFar); // no new network attempt
    } finally {
      vi.useRealTimers();
    }
  });
});
