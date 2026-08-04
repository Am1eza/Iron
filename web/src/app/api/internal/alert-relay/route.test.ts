// @vitest-environment node
/**
 * GlitchTip → SMS alert relay (W29, audit area 16).
 *
 * The property that matters most here is NOT "an alert produces an SMS" — it
 * is that an error STORM does not produce an SMS storm. GlitchTip has 1939
 * issues on record; unthrottled, this endpoint would drain the SMS balance
 * that OTP login depends on and lock everyone out of the site while trying to
 * report that the site is broken.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `vi.mock` is hoisted above the imports, so the spy has to be created inside
// the factory and read back afterwards rather than closed over.
vi.mock('@/lib/server/integrations/smsir', () => ({
  sendSms: vi.fn(async () => ({ ok: true })),
}));

import { sendSms as sendSmsReal } from '@/lib/server/integrations/smsir';
import { POST } from './route';

const sendSms = vi.mocked(sendSmsReal);
import { resetAlertThrottle } from '@/lib/server/alerts/relayThrottle';

const SECRET = 'relay-secret-for-tests';
const OPERATOR = '09121234567';

function post(key: string | null, body: unknown = { text: 'GlitchTip Alert' }) {
  const url = key === null
    ? 'https://ahantime.com/api/internal/alert-relay'
    : `https://ahantime.com/api/internal/alert-relay?key=${encodeURIComponent(key)}`;
  return POST(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  resetAlertThrottle();
  sendSms.mockClear();
  sendSms.mockImplementation(async () => ({ ok: true }));
  process.env.ALERT_RELAY_SECRET = SECRET;
  process.env.ALERT_SMS_TO = OPERATOR;
  // Coalescing off by default in these tests so the HOURLY cap is what is
  // being measured; the coalesce window has its own cases below.
  process.env.ALERT_RELAY_COALESCE_SECONDS = '0';
  delete process.env.ALERT_RELAY_MAX_SMS_PER_HOUR;
});
afterEach(() => {
  delete process.env.ALERT_RELAY_SECRET;
  delete process.env.ALERT_SMS_TO;
  delete process.env.ALERT_RELAY_COALESCE_SECONDS;
  delete process.env.ALERT_RELAY_MAX_SMS_PER_HOUR;
  vi.restoreAllMocks();
});

describe('auth', () => {
  it('403s a wrong secret and sends nothing', async () => {
    const res = await post('wrong-secret');
    expect(res.status).toBe(403);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('403s a missing key', async () => {
    expect((await post(null)).status).toBe(403);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('403s a correct PREFIX of the secret (no length/prefix oracle)', async () => {
    expect((await post(SECRET.slice(0, -1))).status).toBe(403);
    expect((await post(`${SECRET}x`)).status).toBe(403);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('fails CLOSED when no secret is configured — never open', async () => {
    delete process.env.ALERT_RELAY_SECRET;
    const res = await post('anything');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'not_configured' });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('refuses to send without a valid recipient', async () => {
    process.env.ALERT_SMS_TO = 'not-a-mobile';
    const res = await post(SECRET);
    expect(await res.json()).toMatchObject({ reason: 'no_recipient' });
    expect(sendSms).not.toHaveBeenCalled();
  });
});

describe('throttling — an error storm must not become an SMS storm', () => {
  it('caps at ALERT_RELAY_MAX_SMS_PER_HOUR however many alerts arrive', async () => {
    process.env.ALERT_RELAY_MAX_SMS_PER_HOUR = '4';
    for (let i = 0; i < 200; i++) await post(SECRET);
    expect(sendSms).toHaveBeenCalledTimes(4);
  });

  it('defaults to a small cap even with nothing configured', async () => {
    for (let i = 0; i < 50; i++) await post(SECRET);
    expect(sendSms.mock.calls.length).toBeLessThanOrEqual(4);
    expect(sendSms.mock.calls.length).toBeGreaterThan(0);
  });

  it('coalesces inside the window — one SMS, and the rest are counted not lost', async () => {
    process.env.ALERT_RELAY_COALESCE_SECONDS = '300';
    await post(SECRET);
    for (let i = 0; i < 12; i++) await post(SECRET);
    expect(sendSms).toHaveBeenCalledTimes(1);

    const last = await post(SECRET);
    expect(await last.json()).toMatchObject({ sent: false, reason: 'coalesced', suppressed: 13 });
  });

  it('reports the suppressed count in the NEXT message that does go out', async () => {
    process.env.ALERT_RELAY_COALESCE_SECONDS = '300';
    const t0 = Date.now();
    await post(SECRET); // sends
    for (let i = 0; i < 7; i++) await post(SECRET); // coalesced

    // The window rolls.
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 301_000);
    await post(SECRET);

    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms.mock.calls[1]![1]).toContain('+7');
  });

  it('the hourly window rolls — alerting resumes after an hour, it is not a permanent mute', async () => {
    process.env.ALERT_RELAY_MAX_SMS_PER_HOUR = '2';
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) await post(SECRET);
    expect(sendSms).toHaveBeenCalledTimes(2);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 61 * 60_000);
    await post(SECRET);
    expect(sendSms).toHaveBeenCalledTimes(3);
  });
});

describe('message', () => {
  it('leads with the attachment title — the actionable part', async () => {
    await post(SECRET, {
      text: 'GlitchTip Alert',
      attachments: [{ title: 'ValueError: deepseek HTTP 402', text: 'ahantime · production' }],
    });
    const [mobile, text, kind] = sendSms.mock.calls[0]!;
    expect(mobile).toBe(OPERATOR);
    expect(kind).toBe('alert');
    expect(text).toContain('deepseek HTTP 402');
  });

  it('never lets a webhook dictate an unbounded SMS length', async () => {
    await post(SECRET, { attachments: [{ title: 'x'.repeat(5000) }] });
    expect((sendSms.mock.calls[0]![1] as string).length).toBeLessThanOrEqual(300);
  });

  it('survives a payload of an entirely unexpected shape', async () => {
    for (const body of [null, [], 'a string', { attachments: 'not-an-array' }, { attachments: [null] }, {}]) {
      resetAlertThrottle();
      sendSms.mockClear();
      const res = await post(SECRET, body);
      expect(res.status).toBe(200);
      expect(sendSms).toHaveBeenCalledTimes(1);
    }
  });
});

describe('non-fatal', () => {
  it('a failed SMS is still a 200 — a 5xx here would make the monitor retry and alert about the alerter', async () => {
    sendSms.mockImplementation(async () => ({ ok: false, permanent: true }));
    const res = await post(SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: false });
  });

  it('a THROWING sms integration is still a 200', async () => {
    sendSms.mockImplementation(async () => {
      throw new Error('provider exploded');
    });
    const res = await post(SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: false, reason: 'send_error' });
  });
});
