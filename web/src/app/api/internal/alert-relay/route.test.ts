// @vitest-environment node
/**
 * GlitchTip → Telegram alert relay (W29, audit area 16).
 *
 * Three properties matter more than "an alert produces a message":
 *
 *  1. An error STORM must not become a message storm. GlitchTip has 1939
 *     issues on record and a bad deploy produces hundreds of events a minute.
 *  2. Telegram is FILTERED IN IRAN. Every way it can fail — 4xx, 5xx, a
 *     connection that hangs until the timeout — must leave this route
 *     answering fast, answering 2xx, and NOT minting a fresh GlitchTip issue
 *     per attempt (which would webhook straight back here).
 *  3. The message is built from an untrusted webhook payload and sent with
 *     `parse_mode: HTML`. An unescaped `<` in a stack trace makes Telegram
 *     reject the whole message with a 400 — the alert is silently lost at
 *     exactly the moment it was needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { POST } from './route';
import { buildAlertHtml } from '@/lib/server/alerts/alertMessage';
import { resetAlertThrottle } from '@/lib/server/alerts/relayThrottle';
import { resetCircuitBreakers } from '@/lib/server/utils/resilience';
import { TELEGRAM_MAX_MESSAGE_CHARS } from '@/lib/server/integrations/telegram';
import { scrubPii } from '@/lib/errors/scrub';

const SECRET = 'relay-secret-for-tests';
// Shaped like a real BotFather token (`<bot-id>:<35-char secret>`) on purpose —
// the token-leak tests below assert that redaction recognises this shape.
const TOKEN = '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const CHAT_ID = '-1001234567890';

const fetchMock = vi.fn();

function ok(): Response {
  return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) } as unknown as Response;
}
function httpError(status: number, description = 'Bad Request'): Response {
  return { ok: false, status, json: async () => ({ ok: false, description }) } as unknown as Response;
}

function post(key: string | null, body: unknown = { text: 'GlitchTip Alert' }) {
  const url =
    key === null
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

/** The JSON body posted to api.telegram.org on call `i`. */
function sentPayload(i = 0): { chat_id: string; text: string; parse_mode: string } {
  const init = fetchMock.mock.calls[i]![1] as { body: string };
  return JSON.parse(init.body);
}

beforeEach(() => {
  resetAlertThrottle();
  resetCircuitBreakers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
  // reportError writes one structured JSON line per report; silence it and
  // count it (the "does not spam the tracker" test reads this).
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.ALERT_RELAY_SECRET = SECRET;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_ALERT_CHAT_ID = CHAT_ID;
  // Coalescing off by default so the HOURLY cap is what is being measured; the
  // coalesce window has its own cases below.
  process.env.ALERT_RELAY_COALESCE_SECONDS = '0';
  delete process.env.ALERT_RELAY_MAX_PER_HOUR;
  delete process.env.TELEGRAM_API_BASE;
});
afterEach(() => {
  delete process.env.ALERT_RELAY_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_ALERT_CHAT_ID;
  delete process.env.ALERT_RELAY_COALESCE_SECONDS;
  delete process.env.ALERT_RELAY_MAX_PER_HOUR;
  delete process.env.TELEGRAM_API_BASE;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth', () => {
  it('403s a wrong secret and sends nothing', async () => {
    const res = await post('wrong-secret');
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403s a missing key', async () => {
    expect((await post(null)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403s a correct PREFIX of the secret (no length/prefix oracle)', async () => {
    expect((await post(SECRET.slice(0, -1))).status).toBe(403);
    expect((await post(`${SECRET}x`)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED when no secret is configured — never open', async () => {
    delete process.env.ALERT_RELAY_SECRET;
    const res = await post('anything');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('delivery', () => {
  it('posts one HTML message to the Bot API sendMessage endpoint', async () => {
    const res = await post(SECRET, {
      attachments: [{ title: 'ValueError: relay HTTP 402', title_link: 'https://ahantime.com:9443/issues/7' }],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect((init as { method: string }).method).toBe('POST');

    const payload = sentPayload();
    expect(payload.chat_id).toBe(CHAT_ID);
    expect(payload.parse_mode).toBe('HTML');
    expect(payload.text).toContain('relay HTTP 402');
    expect(payload.text).toContain('https://ahantime.com:9443/issues/7');
  });

  it('sets an abort signal — Telegram may hang rather than refuse from Iran', async () => {
    await post(SECRET);
    const init = fetchMock.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('carries the rich context an SMS segment could not: level, count, first/last seen, link', async () => {
    await post(SECRET, {
      text: 'GlitchTip Alert',
      attachments: [
        {
          title: 'TypeError: cannot read x of undefined',
          title_link: 'https://ahantime.com:9443/ahantime/issues/42',
          text: 'src/app/api/prices/route.ts',
          fields: [
            { title: 'Project', value: 'ahantime' },
            { title: 'Level', value: 'error' },
            { title: 'Count', value: 137 },
            { title: 'First Seen', value: '2026-08-01T09:00:00Z' },
            { title: 'Last Seen', value: '2026-08-04T06:00:00Z' },
          ],
        },
      ],
    });
    const { text } = sentPayload();
    for (const fragment of [
      'cannot read x of undefined',
      'src/app/api/prices/route.ts',
      'ahantime',
      'error',
      '137',
      '2026-08-01T09:00:00Z',
      '2026-08-04T06:00:00Z',
      'https://ahantime.com:9443/ahantime/issues/42',
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it('refuses to send — and never claims it sent — with no bot token or chat id', async () => {
    for (const missing of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID'] as const) {
      resetAlertThrottle();
      fetchMock.mockClear();
      const saved = process.env[missing];
      delete process.env[missing];

      const res = await post(SECRET);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, sent: false, reason: 'no_recipient' });
      expect(fetchMock).not.toHaveBeenCalled();

      process.env[missing] = saved;
    }
  });

  it('an unconfigured relay does not burn a throttle slot', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    for (let i = 0; i < 5; i++) await post(SECRET);
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;

    expect(await (await post(SECRET)).json()).toMatchObject({ sent: true });
  });
});

describe('TELEGRAM_API_BASE — api.telegram.org is blocked at the Iranian national level', () => {
  it('defaults to api.telegram.org when unset, so nothing changes off a filtered network', async () => {
    await post(SECRET);
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
  });

  it('uses an overridden base verbatim — the out-of-Iran forwarder hop', async () => {
    process.env.TELEGRAM_API_BASE = 'https://ahantime.giminesap.workers.dev';
    await post(SECRET);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `https://ahantime.giminesap.workers.dev/bot${TOKEN}/sendMessage`,
    );
  });

  it('trims a trailing slash rather than emitting a double slash before /bot', async () => {
    process.env.TELEGRAM_API_BASE = 'https://relay.example.workers.dev///';
    await post(SECRET);
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://relay.example.workers.dev/bot${TOKEN}/sendMessage`);
  });

  it('keeps a path prefix on the base — a forwarder may live under a route', async () => {
    process.env.TELEGRAM_API_BASE = 'https://relay.example.workers.dev/tg/';
    await post(SECRET);
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://relay.example.workers.dev/tg/bot${TOKEN}/sendMessage`);
  });

  it('fails CLOSED on a base that is not an http(s) URL — never falls back to the blocked default', async () => {
    for (const bad of ['api.telegram.org', 'tg://relay', 'file:///etc/passwd', 'not a url']) {
      resetAlertThrottle();
      fetchMock.mockClear();
      process.env.TELEGRAM_API_BASE = bad;

      const res = await post(SECRET);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, sent: false, reason: 'bad_api_base' });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});

describe('the bot token is a bearer credential in a URL path — it must never be logged', () => {
  /** Simulates the common failure shape: a fetch implementation (or a proxy in
   *  front of the forwarder) that puts the full request URL in its error. */
  function failWithUrlInMessage() {
    fetchMock.mockImplementation(async (url: string) => {
      throw new Error(`request to ${url} failed, reason: ECONNRESET`);
    });
  }

  it('does not leak the token when a send fails against an overridden base', async () => {
    process.env.TELEGRAM_API_BASE = 'https://ahantime.giminesap.workers.dev';
    failWithUrlInMessage();

    // Two failures: the second is the transition that actually reports.
    await post(SECRET);
    await post(SECRET);

    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN.split(':')[1]);
    // The reported error is the breaker's own message, which never carried a URL.
    expect(logged).toContain('circuit opening for telegram');
  });

  it('redacts a token embedded in a URL path even when an error message carries the URL', async () => {
    const url = `https://ahantime.giminesap.workers.dev/bot${TOKEN}/sendMessage`;
    const scrubbed = scrubPii(`request to ${url} failed`);
    expect(scrubbed).not.toContain(TOKEN);
    expect(scrubbed).not.toContain(TOKEN.split(':')[1]);
    expect(scrubbed).toBe('request to https://ahantime.giminesap.workers.dev/bot[redacted-token]/sendMessage failed');
  });

  it('redacts a token whose bot id also matches the mobile pattern (scrubber ordering)', () => {
    const trap = `09123456789:${'A'.repeat(34)}`;
    const scrubbed = scrubPii(`GET /bot${trap}/sendMessage`);
    expect(scrubbed).toBe('GET /bot[redacted-token]/sendMessage');
  });

  it('does not redact ordinary `label: value` text or a Toman price', () => {
    expect(scrubPii('total: 1234567890 تومان')).toBe('total: 1234567890 تومان');
    expect(scrubPii('at Object.<anonymous> (file.ts:12:34)')).toBe('at Object.<anonymous> (file.ts:12:34)');
  });

  it('never puts the token in the relay JSON response', async () => {
    process.env.TELEGRAM_API_BASE = 'https://ahantime.giminesap.workers.dev';
    fetchMock.mockImplementation(async () => httpError(401, `Unauthorized for bot${TOKEN}`));
    const res = await post(SECRET);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN.split(':')[1]);
  });
});

describe('escaping — an unescaped stack trace silently kills the alert', () => {
  it('escapes &, < and > everywhere payload text is interpolated', async () => {
    await post(SECRET, {
      attachments: [
        {
          title: 'TypeError: <script>alert(1)</script> & "quotes" in <Foo bar={a>b}>',
          text: 'at <anonymous> (a&b.ts)',
        },
      ],
    });
    const { text } = sentPayload();

    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(text).toContain('&amp;');
    expect(text).toContain('at &lt;anonymous&gt; (a&amp;b.ts)');
    // No raw payload-derived tag survived.
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('<Foo');
    // …while the scaffolding this module wrote itself is still real markup.
    expect(text).toContain('<b>');
  });

  it('never double-escapes an ampersand', () => {
    const html = buildAlertHtml({ attachments: [{ title: 'a & b' }] }, 0);
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('&amp;amp;');
  });

  it('escapes the issue link inside the href attribute', () => {
    const html = buildAlertHtml(
      { attachments: [{ title: 'x', title_link: 'https://ahantime.com:9443/issues/?a=1&b=2' }] },
      0,
    );
    expect(html).toContain('href="https://ahantime.com:9443/issues/?a=1&amp;b=2"');
  });

  it('drops a non-http link rather than relaying it into the operator\'s client', () => {
    const html = buildAlertHtml({ attachments: [{ title: 'x', title_link: 'javascript:alert(1)' }] }, 0);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a href');
  });
});

describe('size — Telegram 400s on anything over 4096 chars', () => {
  it('truncates a giant stack trace well inside the limit', async () => {
    await post(SECRET, { attachments: [{ title: 'x'.repeat(50_000), text: 'y'.repeat(50_000) }] });
    const { text } = sentPayload();
    expect(text.length).toBeLessThan(TELEGRAM_MAX_MESSAGE_CHARS);
    expect(text).toContain('…');
  });

  it('truncation never leaves a half-written HTML entity behind', async () => {
    // All-ampersand text is the adversarial case: every char escapes to five.
    await post(SECRET, { attachments: [{ title: '&'.repeat(50_000) }] });
    const { text } = sentPayload();
    expect(text.length).toBeLessThan(TELEGRAM_MAX_MESSAGE_CHARS);
    expect(/&[#a-zA-Z0-9]*$/.test(text)).toBe(false);
    // Every `&` that made it in is a complete `&amp;`.
    expect(text.split('&').length - 1).toBe(text.split('&amp;').length - 1);
  });

  it('survives a payload of an entirely unexpected shape', async () => {
    for (const body of [null, [], 'a string', { attachments: 'not-an-array' }, { attachments: [null] }, {}]) {
      resetAlertThrottle();
      fetchMock.mockClear();
      const res = await post(SECRET, body);
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

describe('throttling — an error storm must not become a message storm', () => {
  it('caps at ALERT_RELAY_MAX_PER_HOUR however many alerts arrive', async () => {
    process.env.ALERT_RELAY_MAX_PER_HOUR = '4';
    for (let i = 0; i < 200; i++) await post(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('defaults to a hard ceiling even with nothing configured', async () => {
    for (let i = 0; i < 500; i++) await post(SECRET);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(20);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('coalesces inside the window — one message, and the rest are counted not lost', async () => {
    process.env.ALERT_RELAY_COALESCE_SECONDS = '60';
    await post(SECRET);
    for (let i = 0; i < 12; i++) await post(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const last = await post(SECRET);
    expect(await last.json()).toMatchObject({ sent: false, reason: 'coalesced', suppressed: 13 });
  });

  it('reports the suppressed count in the NEXT message that does go out', async () => {
    process.env.ALERT_RELAY_COALESCE_SECONDS = '60';
    const t0 = Date.now();
    await post(SECRET); // sends
    for (let i = 0; i < 7; i++) await post(SECRET); // coalesced

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 61_000);
    await post(SECRET);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentPayload(1).text).toContain('+7');
  });

  it('the hourly window rolls — it is a ceiling, not a permanent mute', async () => {
    process.env.ALERT_RELAY_MAX_PER_HOUR = '2';
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) await post(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 61 * 60_000);
    await post(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('non-fatal — Telegram is an untrusted network dependency', () => {
  it('a 400 (bad token / malformed HTML) is still a 200 with sent:false', async () => {
    fetchMock.mockImplementation(async () => httpError(400, "can't parse entities"));
    const res = await post(SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: false, reason: 'http_error', status: 400 });
  });

  it('a 401 (revoked token) is still a 200', async () => {
    fetchMock.mockImplementation(async () => httpError(401, 'Unauthorized'));
    expect((await post(SECRET)).status).toBe(200);
  });

  it('a 5xx is still a 200 — a 5xx here would make the monitor retry and alert about the alerter', async () => {
    fetchMock.mockImplementation(async () => httpError(502, 'Bad Gateway'));
    const res = await post(SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: false, status: 502 });
  });

  it('a timeout is still a fast 200 — a blocked route must not hold the handler open', async () => {
    fetchMock.mockImplementation(async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    });
    const res = await post(SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: false, reason: 'network_error' });
  });

  it('NEVER retries — one attempt per alert, or a filtered host costs N timeouts', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('ECONNRESET');
    });
    await post(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a Telegram outage ONCE, not once per alert — the report is itself an alert', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('ETIMEDOUT');
    });
    const errorSpy = vi.mocked(console.error);

    for (let i = 0; i < 10; i++) await post(SECRET);

    // withResilience opens the circuit on the second consecutive failure and
    // reports exactly once on that transition (92cab87). Without this rule
    // each report becomes a GlitchTip issue that webhooks back into this very
    // route.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // …and while the circuit is open no further network calls are made at all.
    expect(fetchMock.mock.calls.length).toBeLessThan(10);
  });

  it('recovers on its own once Telegram answers again', async () => {
    process.env.ALERT_RELAY_MAX_PER_HOUR = '100';
    const t0 = Date.now();
    fetchMock.mockImplementation(async () => {
      throw new Error('ETIMEDOUT');
    });
    await post(SECRET);
    await post(SECRET); // circuit opens here

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 121_000); // the breaker cools down
    fetchMock.mockImplementation(async () => ok());
    expect(await (await post(SECRET)).json()).toMatchObject({ sent: true });
  });
});
