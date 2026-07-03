// @vitest-environment node
/**
 * Locks the exact wire format against SMS.ir's real API — verified by
 * installing the official `smsir-js` package (github.com/IPeCompany/
 * SmsPanelV2.nodejs) and reading its actual source directly, not a
 * fetched/summarized doc page. The request body uses PascalCase
 * (Mobile/TemplateId/Parameters), the URL has a trailing slash, and Accept
 * is application/json — this file previously sent camelCase, no trailing
 * slash, and Accept: text/plain, none of which had ever been exercised
 * against the real API (only the dev-log fallback path had test coverage).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('sendOtpSms', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('dev/unconfigured: logs and returns the code without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpSms } = await import('./sms');

    const result = await sendOtpSms('09120000000', '12345');

    expect(result).toEqual({ ok: true, devCode: '12345' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('production without credentials fails closed instead of claiming success', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpSms } = await import('./sms');

    const result = await sendOtpSms('09120000000', '12345');

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live mode calls the exact verified SMS.ir Verify API shape', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '100000');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, message: 'ok', data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { sendOtpSms } = await import('./sms');

    const result = await sendOtpSms('09120000000', '12345');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.sms.ir/v1/send/verify/');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': 'test-key',
    });
    expect(JSON.parse(init.body)).toEqual({
      Mobile: '09120000000',
      TemplateId: 100000,
      Parameters: [{ Name: 'Code', Value: '12345' }],
    });
  });

  it('treats a non-1 status in the response body as a failure', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '100000');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 2, message: 'rejected' }) }),
    );
    const { sendOtpSms } = await import('./sms');

    expect(await sendOtpSms('09120000000', '12345')).toEqual({ ok: false });
  });

  it('treats a non-ok HTTP response as a failure', async () => {
    vi.stubEnv('SMSIR_API_KEY', 'test-key');
    vi.stubEnv('SMSIR_TEMPLATE_ID', '100000');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => null }));
    const { sendOtpSms } = await import('./sms');

    expect(await sendOtpSms('09120000000', '12345')).toEqual({ ok: false });
  });
});
