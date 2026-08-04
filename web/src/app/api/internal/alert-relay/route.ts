import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from '@/lib/auth/crypto';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { admitAlert } from '@/lib/server/alerts/relayThrottle';
import { sendTelegramHtml, telegramApiBase, telegramConfig } from '@/lib/server/integrations/telegram';
import { buildAlertHtml } from '@/lib/server/alerts/alertMessage';

export const runtime = 'nodejs';

/**
 * POST /api/internal/alert-relay — turn a GlitchTip **webhook** into one
 * Telegram message to the operator (W29, audit area 16).
 *
 * WHY THIS EXISTS. GlitchTip has recorded 1939 issues and has never told
 * anyone: `projectalerts | 0`, `recipients | 0`, `notifications | 0`. Email is
 * not the fix — docker-compose.yml states plainly that there is no SMTP on
 * this host, so an email alert could be defined and still never be delivered.
 *
 * WHY TELEGRAM, NOT SMS. This relay shipped on SMS.ir (6169f7d) and the owner
 * has since ruled that out: errors must not draw down the SMS balance that OTP
 * LOGIN depends on. Telegram is free, and a 4096-character message can carry
 * the title, culprit, level, event count, first/last seen AND a clickable link
 * to the issue — where a 70-character SMS segment could carry a truncated
 * exception name and nothing else. **SMS.ir itself is untouched** and remains
 * the owner-locked channel for OTP and proformas.
 *
 * AUTH. A shared secret in the query string (`?key=…`), not a header:
 * GlitchTip's webhook ProjectAlert lets the owner configure a URL and nothing
 * else — there is no field for a custom header. Compared with a
 * constant-time comparison, and the route refuses to run at all when
 * ALERT_RELAY_SECRET is unset (fail closed — an unset secret must never mean
 * "no auth required" on a publicly reachable endpoint).
 *
 * THROTTLE. See relayThrottle.ts, including why the limits are looser than the
 * SMS ones. An error storm is the NORMAL case for this endpoint. Suppressed
 * alerts are counted and reported in the next message, never silently dropped.
 *
 * NON-FATAL. Every failure path answers 2xx with a reason instead of an error
 * status: this endpoint is called by a monitoring system, and a 500 here would
 * produce retries, alerts about the alerter, and noise in the very error
 * tracker it is reading from. The only 4xx is a bad secret. Telegram is a
 * network dependency that is filtered in Iran and may stop answering at any
 * time; see integrations/telegram.ts for the timeout / no-retry / report-once
 * policy that keeps that from becoming an outage of this route.
 *
 * ── OWNER SETUP (must be done once — the code cannot do it for you) ────────
 *  A. Telegram, in the app:
 *     1. Message @BotFather → /newbot → pick a name and a @username.
 *        BotFather answers with the token: `8123456789:AA…`. That is
 *        TELEGRAM_BOT_TOKEN. Treat it as a password — anyone holding it can
 *        post as the bot.
 *     2. Decide where alerts land. Simplest: open a chat with your new bot and
 *        press Start (a bot cannot message you until you do). For a team,
 *        create a group/channel and add the bot as an admin instead.
 *     3. Get the chat id: send any message in that chat, then open
 *        https://api.telegram.org/bot<TOKEN>/getUpdates and read
 *        `result[0].message.chat.id`. Private chats are positive
 *        (`123456789`), groups/channels negative (`-1001234567890`). That is
 *        TELEGRAM_ALERT_CHAT_ID.
 *  B. Put TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID and ALERT_RELAY_SECRET
 *     in .env (see .env.example), then `docker compose up -d web`.
 *  B2. FROM IRAN, ALSO SET TELEGRAM_API_BASE. api.telegram.org is blocked at
 *     the national level from this server (it resolves to the filtering
 *     address 10.10.34.36 and TCP 443 is refused), so a direct call can never
 *     succeed — set the base to the owner's out-of-Iran Cloudflare Worker
 *     forwarder instead. See integrations/telegram.ts for the measurements and
 *     for why the bot token being handed to that hop is a deliberate,
 *     bounded trade.
 *  C. GlitchTip → your organization → the project → Alerts → "Create New Alert"
 *     → timespan 1 minute, "Notify when 1 event(s) occur" (the throttle here
 *       is what protects the operator, so keep GlitchTip's trigger loose)
 *     → Alert Recipients: **Webhook** (NOT Email — there is no SMTP here)
 *     → URL: https://ahantime.com/api/internal/alert-relay?key=<ALERT_RELAY_SECRET>
 *     → Save, then "Send Test Notification" and confirm one Telegram message
 *       arrives. A second test inside ALERT_RELAY_COALESCE_SECONDS is EXPECTED
 *       not to arrive — that is the coalescing working, not a failure.
 */

async function POSTImpl(req: NextRequest) {
  const secret = process.env.ALERT_RELAY_SECRET;
  if (!secret) {
    // Fail CLOSED. An unset secret is a misconfiguration, and treating it as
    // "open" would leave an unauthenticated relay endpoint exposed.
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }
  // `new URL(req.url)`, not `req.nextUrl`: this handler is also reachable from
  // a plain `Request` (tests, and any non-Next invocation), where `nextUrl` is
  // undefined — and an alerting endpoint that throws on a shape it did not
  // expect is the one thing it must never do.
  const key = new URL(req.url).searchParams.get('key') ?? '';
  // Constant-time — this is a bearer secret in a URL, so a length/prefix
  // oracle here would be genuinely useful to an attacker.
  if (!timingSafeEqual(key, secret)) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });
  }

  // Checked BEFORE the throttle is consumed: with no bot token, no chat id or
  // a malformed TELEGRAM_API_BASE there is nowhere to deliver, and burning a
  // throttle slot on an undeliverable alert would mute a correctly-configured
  // one later. Answering `sent: false` is the point — the relay must never
  // imply it delivered. The two reasons are distinct because the fixes are:
  // one is a missing value, the other is a typo in a value that is present.
  if (!telegramApiBase()) {
    return NextResponse.json({ ok: false, sent: false, reason: 'bad_api_base' }, { status: 503 });
  }
  if (!telegramConfig()) {
    return NextResponse.json({ ok: false, sent: false, reason: 'no_recipient' }, { status: 503 });
  }

  const body: unknown = await req.json().catch(() => null);

  // Exactly once per request — admitAlert consumes the decision.
  const decision = admitAlert();
  if (!decision.send) {
    return NextResponse.json({ ok: true, sent: false, reason: decision.reason, suppressed: decision.suppressed });
  }

  try {
    const res = await sendTelegramHtml(buildAlertHtml(body, decision.suppressed));
    // A failure is NOT reported here: telegram.ts reports once per transition
    // into a broken state (92cab87's rule). Reporting per alert would mint a
    // GlitchTip issue per attempt, and each of those issues webhooks straight
    // back to this route.
    return NextResponse.json({
      ok: true,
      sent: res.ok,
      ...(res.ok ? {} : { reason: res.reason, status: res.status }),
      suppressed: decision.suppressed,
    });
  } catch {
    // sendTelegramHtml is written not to throw; this is the belt to its
    // braces. Never surface a 5xx to the monitoring system — see the docblock.
    return NextResponse.json({ ok: true, sent: false, reason: 'send_error' });
  }
}

export const POST = withApiErrorHandling(POSTImpl);
