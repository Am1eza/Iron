/**
 * The forwarder secret is the one part of the Telegram chain whose failure is
 * completely invisible from the outside: without it every alert 403s at the
 * hop, nothing is delivered, and the app reports only a generic http_error.
 * It shipped missing once — the base URL was made configurable but the secret
 * was never sent — so these tests exist to make that impossible to repeat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendTelegramHtml, resetTelegramBreaker, telegramConfig } from './telegram';

const BASE_ENV = {
  TELEGRAM_BOT_TOKEN: '8833823170:AAFyTESTTESTTESTTESTTESTTESTTESTTEST',
  TELEGRAM_ALERT_CHAT_ID: '8603621642',
};

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function okFetch(): FetchMock {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
}

function headersOf(fetchMock: FetchMock): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1];
  return (init?.headers ?? {}) as Record<string, string>;
}

function urlOf(fetchMock: FetchMock): string {
  return String(fetchMock.mock.calls[0]?.[0]);
}

beforeEach(() => {
  resetTelegramBreaker();
  vi.restoreAllMocks();
});

describe('telegramConfig', () => {
  it('reads the forward secret and trims it', () => {
    const cfg = telegramConfig({ ...BASE_ENV, TELEGRAM_FORWARD_SECRET: '  s3cret  ' });
    expect(cfg?.forwardSecret).toBe('s3cret');
  });

  it('defaults the forward secret to empty rather than undefined', () => {
    const cfg = telegramConfig(BASE_ENV);
    expect(cfg?.forwardSecret).toBe('');
  });
});

describe('sendTelegramHtml — forwarder authentication', () => {
  it('sends x-forward-secret when talking to a forwarder', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);

    const res = await sendTelegramHtml('hello', {
      ...BASE_ENV,
      TELEGRAM_API_BASE: 'https://telegram-forwarder.example.workers.dev',
      TELEGRAM_FORWARD_SECRET: 'shared-secret-value',
    });

    expect(res.ok).toBe(true);
    expect(headersOf(f)['x-forward-secret']).toBe('shared-secret-value');
  });

  it('omits the header entirely when no secret is configured', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);

    await sendTelegramHtml('hello', BASE_ENV);

    // Not "empty string" — absent. An empty header is a different request than
    // the one a direct-to-Telegram deployment used to send.
    expect(headersOf(f)).not.toHaveProperty('x-forward-secret');
  });

  it('never puts the secret in the URL, where it would reach access logs', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);

    await sendTelegramHtml('hello', {
      ...BASE_ENV,
      TELEGRAM_API_BASE: 'https://telegram-forwarder.example.workers.dev',
      TELEGRAM_FORWARD_SECRET: 'shared-secret-value',
    });

    const url = urlOf(f);
    expect(url).not.toContain('shared-secret-value');
    expect(url).not.toContain('key=');
    expect(url).toBe(
      'https://telegram-forwarder.example.workers.dev/bot' +
        BASE_ENV.TELEGRAM_BOT_TOKEN +
        '/sendMessage',
    );
  });

  it('reports a hop rejection as a plain http_error without leaking the secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );

    const res = await sendTelegramHtml('hello', {
      ...BASE_ENV,
      TELEGRAM_API_BASE: 'https://telegram-forwarder.example.workers.dev',
      TELEGRAM_FORWARD_SECRET: 'shared-secret-value',
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.reason).toBe('http_error');
    expect(JSON.stringify(res)).not.toContain('shared-secret-value');
  });
});
