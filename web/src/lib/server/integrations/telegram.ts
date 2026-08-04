/**
 * Telegram Bot API — the delivery channel for operator alerts.
 *
 * WHY NOT SMS. The GlitchTip relay used to send its alerts through SMS.ir.
 * The owner has ruled that out: errors must not consume the SMS balance that
 * OTP LOGIN depends on, and a 70-character segment cannot carry a stack
 * culprit, an event count and a link. Telegram is free, unmetered and lets a
 * message be 4096 characters with formatting. (SMS.ir itself is untouched and
 * still owner-locked — it keeps doing OTP and proformas.)
 *
 * api.telegram.org IS BLOCKED AT THE IRANIAN NATIONAL LEVEL. Measured from
 * this server, not assumed: `getent hosts api.telegram.org` answers
 * 10.10.34.36 — the filtering address — plus 2001:4188:2:600:10:10:34:36 on
 * v6; TCP 443 to the v4 address is refused outright, v6 times out, and
 * `curl .../getMe` gives HTTP 000 after 10s. api.github.com and
 * registry.npmjs.org both answer 200 from the same shell, so this is
 * Telegram-specific censorship rather than a network fault. A direct call can
 * therefore NEVER succeed here.
 *
 * That is what TELEGRAM_API_BASE is for: point it at an out-of-Iran forwarder
 * (the owner's Cloudflare Worker) that re-issues the request to Telegram. It
 * defaults to https://api.telegram.org so nothing changes for a deployment
 * that is not behind a filter. **Do not "simplify" this back to a hardcoded
 * host** — that silently breaks the entire alert chain in production, and the
 * failure is invisible because a broken alerter cannot alert about itself.
 *
 * THE TOKEN IS A BEARER CREDENTIAL AND IT TRAVELS IN THE URL PATH, because
 * that is the only shape Telegram's API accepts. Two consequences:
 *  - Overriding the base hands the token to whatever host is configured. Only
 *    point it at a hop the owner controls.
 *  - The URL must never reach a log line, an error message or a GlitchTip
 *    event. Nothing here interpolates the URL into an error, and scrub.ts
 *    additionally redacts a bot-token-shaped value out of ANY reported string
 *    — a failing `fetch` implementation that puts the request URL in its
 *    message would otherwise publish the credential to the error tracker.
 *
 * THIS IS AN UNTRUSTED NETWORK DEPENDENCY. Even through the forwarder, one
 * more hop is one more thing that can be down or itself get filtered. So this
 * module is written to fail fast and stay quiet:
 *
 *  - Explicit `AbortSignal.timeout` on the fetch. An alerting call must never
 *    hold a route handler open waiting on a blocked TCP connection.
 *  - NO RETRY (`retries: 0`). A retry against a filtered host is just N times
 *    the timeout; the alert is a nudge, and the next event will produce
 *    another one anyway.
 *  - Wrapped in `withResilience`, which is where the once-per-state-transition
 *    reporting rule already lives (92cab87). A permanently unreachable
 *    Telegram therefore produces exactly ONE GlitchTip issue per outage, not
 *    one per alert. That matters more here than anywhere else in the codebase:
 *    reporting a delivery failure creates an error, which GlitchTip webhooks
 *    back to the relay, which tries to deliver it… the circuit breaker is what
 *    stops that loop after one lap.
 *
 * Nothing here throws to its caller by design — `sendTelegramHtml` resolves to
 * a result object. The relay treats every failure as non-fatal.
 */
import { scrubPii } from '@/lib/errors/scrub';
import { withResilience } from '@/lib/server/utils/resilience';

/** Telegram's hard limit for `sendMessage.text`. Over it the API answers 400
 *  and the alert is silently lost, so every message is clamped below it. */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/** Well under the limit, leaving room for the entity tags we add ourselves. */
export const MESSAGE_BUDGET = 3800;

/** Short on purpose: this runs inside a webhook handler that must answer
 *  quickly, and a blocked route to Telegram fails by hanging, not by RST. */
const FETCH_TIMEOUT_MS = 6000;

/** Telegram's own host. Correct everywhere that is not behind a filter, and
 *  the default so an unconfigured deployment behaves exactly as before. */
export const DEFAULT_TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramConfig {
  token: string;
  chatId: string;
  /** Already validated and stripped of any trailing slash. */
  apiBase: string;
}

/**
 * Resolve TELEGRAM_API_BASE. Returns null when the value is set but is not an
 * http(s) URL — FAIL CLOSED: a typo'd or non-http base (`api.telegram.org`
 * with no scheme, a `file:`/`tg:` URL, a hostname pasted with a stray space)
 * must stop the send with a clear reason, never silently fall back to the
 * default that is known not to work here.
 *
 * The trailing slash is trimmed rather than rejected: `https://host/` and
 * `https://host` are the same hop, and a double slash before `/bot…` is the
 * kind of thing that produces a 404 nobody can explain.
 */
export function telegramApiBase(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  const raw = (env.TELEGRAM_API_BASE ?? '').trim();
  if (!raw) return DEFAULT_TELEGRAM_API_BASE;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return raw.replace(/\/+$/, '');
}

/**
 * Config comes from the environment and there is no fallback. If any part is
 * missing or invalid the caller must report "not delivered" — never pretend.
 */
export function telegramConfig(env: Partial<NodeJS.ProcessEnv> = process.env): TelegramConfig | null {
  const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (env.TELEGRAM_ALERT_CHAT_ID ?? '').trim();
  const apiBase = telegramApiBase(env);
  if (!token || !chatId || !apiBase) return null;
  return { token, chatId, apiBase };
}

/**
 * Escape for `parse_mode: HTML`.
 *
 * HTML mode is chosen over MarkdownV2 precisely because this is the whole of
 * the escaping rule: Telegram's HTML parser only cares about `&`, `<` and `>`.
 * MarkdownV2 requires escaping eighteen characters (`_*[]()~`>#+-=|{}.!`),
 * every one of which appears routinely in a stack trace or a file path — a
 * single unescaped `_` makes the API reject the whole message with a 400 and
 * the alert vanishes. `&` MUST be replaced first or the subsequent
 * replacements would double-escape their own output.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Truncate ALREADY-ESCAPED html without leaving a half-written entity or tag
 * behind — `&am` or `<b` would make Telegram reject the message, which is the
 * exact failure mode the clamp exists to prevent.
 */
export function clampHtml(html: string, max: number = MESSAGE_BUDGET): string {
  if (html.length <= max) return html;
  const cut = html
    .slice(0, max - 1)
    .replace(/&[#a-zA-Z0-9]*$/, '')
    .replace(/<[^>]*$/, '');
  return `${cut}…`;
}

export interface TelegramResult {
  ok: boolean;
  status?: number;
  /** Machine-readable failure cause for the relay's JSON response. */
  reason?: 'not_configured' | 'bad_api_base' | 'http_error' | 'network_error' | 'api_error';
}

class TelegramHttpError extends Error {
  constructor(public status: number, public description?: string) {
    super(description ? `telegram ${status}: ${description}` : `telegram ${status}`);
    this.name = 'TelegramHttpError';
  }
}

/** Bound what a Telegram error body can push into logs. */
const DESCRIPTION_MAX = 200;

async function readDescription(res: Response): Promise<string | undefined> {
  try {
    if (typeof res.json !== 'function') return undefined;
    const body: unknown = await res.json();
    const d = (body as { description?: unknown } | null)?.description;
    // Scrubbed: with TELEGRAM_API_BASE overridden this body comes from the
    // forwarder, not from Telegram, and a forwarder that echoes the upstream
    // URL it just called would hand the bot token back for us to log.
    return typeof d === 'string' ? scrubPii(d.slice(0, DESCRIPTION_MAX)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * POST one HTML message to the alert chat. `html` must already be escaped by
 * the caller (see `escapeHtml`) and is clamped here as a last line of defence.
 *
 * Never throws. The relay's contract is that a delivery failure is a logged
 * non-event, not a 500 back to the monitoring system.
 */
export async function sendTelegramHtml(
  html: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): Promise<TelegramResult> {
  const cfg = telegramConfig(env);
  if (!cfg) return { ok: false, reason: telegramApiBase(env) ? 'not_configured' : 'bad_api_base' };

  const body = JSON.stringify({
    chat_id: cfg.chatId,
    text: clampHtml(html, MESSAGE_BUDGET),
    parse_mode: 'HTML',
    // The message already carries the issue link as an anchor; Telegram's own
    // link preview card would add a screenshot-sized block per alert.
    disable_web_page_preview: true,
  });

  try {
    return await withResilience(
      'telegram',
      async () => {
        // The token sits in the path because Telegram's API takes it nowhere
        // else. It is never logged: no error raised below carries this string.
        const res = await fetch(`${cfg.apiBase}/bot${cfg.token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new TelegramHttpError(res.status, await readDescription(res));
        return { ok: true, status: res.status } satisfies TelegramResult;
      },
      {
        // See the docblock: one attempt, and the FIRST pair of consecutive
        // failures opens the circuit so a Telegram outage costs one issue in
        // the tracker rather than one per alert. A single blip does not mute
        // alerting — two in a row do, for two minutes.
        retries: 0,
        failureThreshold: 2,
        openMs: 120_000,
      },
    );
  } catch (err) {
    const status = err instanceof TelegramHttpError ? err.status : undefined;
    // Reporting happens inside withResilience, once per transition into open.
    // Deliberately no reportError() here — that is the duplicate-issue bug
    // 92cab87 fixed, and on this code path it is also an infinite loop.
    return {
      ok: false,
      status,
      reason: status === undefined ? 'network_error' : 'http_error',
    };
  }
}

/** Test-only escape hatch mirroring resilience.ts's own reset. */
export { resetCircuitBreakers as resetTelegramBreaker } from '@/lib/server/utils/resilience';
