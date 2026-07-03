// @vitest-environment node
/**
 * Same verified-wire-format regression as auth/sms.test.ts, for the bulk
 * free-text send path — see that file's header comment for how the shape
 * was confirmed against the real official SDK source.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('sendSms (bulk)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('dev/unconfigured: logs and returns ok without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendSms } = await import('./smsir');

    const result = await sendSms('09120000000', 'سلام', 'generic');

    expect(result).toEqual({ ok: true });
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

  it('treats a non-1 status in the response body as a failure', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 2, message: 'rejected' }) }),
    );
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false });
  });

  it('treats a non-ok HTTP response as a failure', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_LINE_NUMBER', '3000123456');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));
    const { sendSms } = await import('./smsir');

    expect(await sendSms('09120000000', 'سلام')).toEqual({ ok: false });
  });
});
