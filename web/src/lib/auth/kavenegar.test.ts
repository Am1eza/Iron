// @vitest-environment node
/**
 * Locks the Kavenegar verify/lookup wire format (kavenegar.com/rest.html):
 * POST https://api.kavenegar.com/v1/{key}/verify/lookup.json with
 * form-encoded receptor/token/template, success = return.status 200.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('sendOtpViaKavenegar', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reports notConfigured (and never fetches) when env is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpViaKavenegar } = await import('./kavenegar');

    const r = await sendOtpViaKavenegar('09120000000', '12345');

    expect(r).toEqual({ ok: false, notConfigured: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the exact verify/lookup shape and returns ok on return.status 200', async () => {
    vi.stubEnv('KAVENEGAR_API_KEY', 'test-key');
    vi.stubEnv('KAVENEGAR_OTP_TEMPLATE', 'ahantime-otp');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ return: { status: 200, message: 'تایید شد' }, entries: [{ status: 5 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpViaKavenegar } = await import('./kavenegar');

    const r = await sendOtpViaKavenegar('09120000000', '12345');

    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.kavenegar.com/v1/test-key/verify/lookup.json');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get('receptor')).toBe('09120000000');
    expect(body.get('token')).toBe('12345');
    expect(body.get('template')).toBe('ahantime-otp');
  });

  it('returns not-ok on a provider error status (e.g. 424 template not approved)', async () => {
    vi.stubEnv('KAVENEGAR_API_KEY', 'test-key');
    vi.stubEnv('KAVENEGAR_OTP_TEMPLATE', 'ahantime-otp');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ return: { status: 424, message: 'template not found' } }) }),
    );
    const { sendOtpViaKavenegar } = await import('./kavenegar');

    const r = await sendOtpViaKavenegar('09120000000', '12345');

    expect(r).toEqual({ ok: false });
  });
});

describe('sendOtpSms provider selection', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('prefers Kavenegar over SMS.ir when both are configured', async () => {
    vi.stubEnv('KAVENEGAR_API_KEY', 'kave-key');
    vi.stubEnv('KAVENEGAR_OTP_TEMPLATE', 'ahantime-otp');
    vi.stubEnv('SMSIR_API_KEY', 'smsir-key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '100000');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ return: { status: 200 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpSms } = await import('./sms');

    const result = await sendOtpSms('09120000000', '12345');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Kavenegar host, NOT sms.ir — proves the preferred provider ran.
    expect(fetchMock.mock.calls[0]![0]).toContain('api.kavenegar.com');
  });

  it('falls back to SMS.ir when Kavenegar fails but SMS.ir is configured', async () => {
    vi.stubEnv('KAVENEGAR_API_KEY', 'kave-key');
    vi.stubEnv('KAVENEGAR_OTP_TEMPLATE', 'ahantime-otp');
    vi.stubEnv('SMSIR_API_KEY', 'smsir-key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '100000');
    const fetchMock = vi
      .fn()
      // 1st call = Kavenegar, fails
      .mockResolvedValueOnce({ ok: true, json: async () => ({ return: { status: 424 } }) })
      // 2nd call = SMS.ir, succeeds
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 1, data: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpSms } = await import('./sms');

    const result = await sendOtpSms('09120000000', '12345');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toContain('api.kavenegar.com');
    expect(fetchMock.mock.calls[1]![0]).toContain('api.sms.ir');
  });
});
