import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from '@/lib/auth/crypto';
import { normalizeMobile } from '@/lib/utils/format';
import { reportError } from '@/lib/errors/report';
import { sendSms } from '@/lib/server/integrations/smsir';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { admitAlert } from '@/lib/server/alerts/relayThrottle';

export const runtime = 'nodejs';

/**
 * POST /api/internal/alert-relay — turn a GlitchTip **webhook** into one SMS
 * to the operator (W29, audit area 16).
 *
 * WHY THIS EXISTS. GlitchTip has recorded 1939 issues and has never told
 * anyone: `projectalerts | 0`, `recipients | 0`, `notifications | 0`. Email is
 * not the fix — docker-compose.yml states plainly that there is no SMTP on
 * this host, so an email alert could be defined and still never be delivered.
 * SMS.ir is already wired, already paid for, and already reaches the operator.
 *
 * AUTH. A shared secret in the query string (`?key=…`), not a header:
 * GlitchTip's webhook ProjectAlert lets the owner configure a URL and nothing
 * else — there is no field for a custom header. Compared with a
 * constant-time comparison, and the route refuses to run at all when
 * ALERT_RELAY_SECRET is unset (fail closed — an unset secret must never mean
 * "no auth required" on an endpoint that spends money).
 *
 * THROTTLE. See relayThrottle.ts. An error storm is the NORMAL case for this
 * endpoint, and unthrottled it would drain the SMS balance that OTP login
 * depends on. Suppressed alerts are counted and reported in the next message,
 * never silently dropped.
 *
 * NON-FATAL. Every failure path answers 200/2xx-ish with a reason instead of
 * an error status: this endpoint is called by a monitoring system, and a 500
 * here would produce retries, alerts about the alerter, and noise in the very
 * error tracker it is reading from. The only 4xx is a bad secret.
 *
 * ── OWNER SETUP (must be done once, in the GlitchTip UI) ──────────────────
 *  1. Set ALERT_RELAY_SECRET and ALERT_SMS_TO in .env (see .env.example),
 *     then `docker compose up -d web`.
 *  2. GlitchTip → your organization → the project → Alerts → "Create New Alert".
 *  3. Timespan 1 minute, "Notify when 1 event(s) occur" (the throttle here is
 *     what protects the SMS balance, so keep GlitchTip's own trigger loose).
 *  4. Under "Alert Recipients" choose **Webhook** (NOT Email — there is no
 *     SMTP on this host) and paste:
 *       https://ahantime.com/api/internal/alert-relay?key=<ALERT_RELAY_SECRET>
 *  5. Save, then use GlitchTip's "Send Test Notification" and confirm one SMS
 *     arrives. A second test within ALERT_RELAY_COALESCE_SECONDS is EXPECTED
 *     not to arrive — that is the coalescing working, not a failure.
 */

/** Everything below is untrusted input from a webhook — parsed defensively.
 *  GlitchTip's generic webhook payload is Slack-shaped
 *  (`{ text, alias, attachments: [{ title, title_link, text }], sections }`)
 *  and has changed shape across versions, so nothing here is required and no
 *  field is trusted to be a string. */
function summarize(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const attachments = Array.isArray(b.attachments) ? b.attachments : [];
  const first = (attachments[0] ?? {}) as Record<string, unknown>;
  // Title first — it carries the exception type/message, which is the part an
  // operator can act on. `text` is usually just "GlitchTip Alert".
  const parts = [str(first.title), str(first.text), str(b.text)].filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((p) => !seen.has(p) && seen.add(p));
  return unique.join(' — ') || 'رویداد جدید';
}

/** SMS.ir bills per 70-char segment; an error message can be arbitrarily long
 *  and the alert is a nudge to go look, not the log itself. */
function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

async function POSTImpl(req: NextRequest) {
  const secret = process.env.ALERT_RELAY_SECRET;
  if (!secret) {
    // Fail CLOSED. An unset secret is a misconfiguration, and treating it as
    // "open" would leave an unauthenticated, SMS-spending endpoint exposed.
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

  const to = normalizeMobile(process.env.ALERT_SMS_TO ?? '');
  if (!to) {
    reportError(new Error('alert-relay: ALERT_SMS_TO missing or not an Iranian mobile'), {
      scope: 'alerts',
      route: 'internal/alert-relay',
    });
    return NextResponse.json({ ok: false, reason: 'no_recipient' }, { status: 503 });
  }

  const body: unknown = await req.json().catch(() => null);

  // Exactly once per request — admitAlert consumes the decision.
  const decision = admitAlert();
  if (!decision.send) {
    return NextResponse.json({ ok: true, sent: false, reason: decision.reason, suppressed: decision.suppressed });
  }

  const more = decision.suppressed > 0 ? ` (+${decision.suppressed} مورد دیگر)` : '';
  const text = clamp(`آهن‌تایم | خطای سرور: ${summarize(body)}${more}`, 300);

  try {
    const res = await sendSms(to, text, 'alert');
    if (!res.ok) {
      reportError(new Error('alert-relay: SMS send failed'), {
        scope: 'alerts',
        route: 'internal/alert-relay',
        permanent: res.permanent === true,
      });
    }
    return NextResponse.json({ ok: true, sent: res.ok, suppressed: decision.suppressed });
  } catch (err) {
    // Never surface a 5xx to the monitoring system — see the docblock.
    reportError(err, { scope: 'alerts', route: 'internal/alert-relay' });
    return NextResponse.json({ ok: true, sent: false, reason: 'send_error' });
  }
}

export const POST = withApiErrorHandling(POSTImpl);
