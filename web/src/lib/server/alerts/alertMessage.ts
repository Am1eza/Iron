/**
 * Compose the operator-facing Telegram message from a GlitchTip webhook
 * payload (W29, audit area 16).
 *
 * Lives here rather than in the route file for two reasons: Next's App Router
 * rejects any export from a `route.ts` other than the HTTP verbs (a
 * `buildAlertHtml` export fails the production type check outright), and this
 * is the half worth unit-testing directly — the parsing is defensive against a
 * payload shape that has changed across GlitchTip versions, and the escaping
 * is what stands between a stack trace and a silently-dropped alert.
 */
import { escapeHtml } from '@/lib/server/integrations/telegram';

/** Everything below is untrusted input from a webhook — parsed defensively.
 *  GlitchTip's generic webhook payload is Slack-shaped
 *  (`{ text, alias, attachments: [{ title, title_link, text, fields }], sections }`)
 *  and has changed shape across versions, so nothing here is required and no
 *  field is trusted to be a string. */
type Dict = Record<string, unknown>;

const asDict = (v: unknown): Dict => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/**
 * Harvest every `{title,value}` / `{name,value}` pair GlitchTip attaches,
 * wherever it decided to put them this version: `attachments[].fields`
 * (Slack shape), `sections[].facts` (Teams shape), `sections[]` itself.
 * Keys are lowercased so lookup is version- and case-insensitive.
 */
function harvestFields(body: Dict): Map<string, string> {
  const out = new Map<string, string>();
  const add = (k: unknown, v: unknown) => {
    const key = str(k).toLowerCase();
    const val = str(v);
    if (key && val && !out.has(key)) out.set(key, val);
  };
  const scan = (items: unknown[]) => {
    for (const raw of items) {
      const it = asDict(raw);
      // Only a real `value` makes something a field. Without this guard the
      // attachment itself would land in the map as `<exception message> →
      // <culprit>`, which is junk that can shadow a genuine key.
      if (it.value !== undefined) add(it.title ?? it.name ?? it.key, it.value);
      if (Array.isArray(it.fields)) scan(it.fields);
      if (Array.isArray(it.facts)) scan(it.facts);
    }
  };
  scan(asArray(body.attachments));
  scan(asArray(body.sections));
  return out;
}

interface Alert {
  title: string;
  culprit: string;
  project: string;
  level: string;
  count: string;
  firstSeen: string;
  lastSeen: string;
  link: string;
}

/** Only ever render a link we are sure is an http(s) URL — the payload is
 *  untrusted and `javascript:`/`tg://` in an anchor is not something to relay
 *  into the operator's Telegram client. */
function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

function parseAlert(body: unknown): Alert {
  const b = asDict(body);
  const attachment = asDict(asArray(b.attachments)[0]);
  const issue = { ...asDict(b.event), ...asDict(b.issue), ...asDict(b.data) };
  const f = harvestFields(b);
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = f.get(k);
      if (v) return v;
    }
    return '';
  };

  return {
    // Title first — it carries the exception type/message, the part an
    // operator can act on. `b.text` is usually just "GlitchTip Alert".
    title: str(attachment.title) || str(issue.title) || pick('issue', 'title') || str(b.text) || 'رویداد جدید',
    culprit: str(attachment.text) || str(issue.culprit) || pick('culprit', 'location'),
    project: str(issue.project) || pick('project', 'پروژه'),
    level: str(issue.level) || pick('level', 'severity'),
    count: str(issue.count) || pick('count', 'events', 'event count', 'times seen'),
    firstSeen: str(issue.firstSeen) || str(issue.first_seen) || pick('first seen', 'firstseen'),
    lastSeen: str(issue.lastSeen) || str(issue.last_seen) || pick('last seen', 'lastseen'),
    link:
      safeUrl(str(attachment.title_link)) ||
      safeUrl(str(issue.web_url)) ||
      safeUrl(str(issue.permalink)) ||
      safeUrl(pick('link', 'url')),
  };
}

/** Per-field caps. Their sum is comfortably under the 3800-char budget in
 *  telegram.ts, so the message is bounded BY CONSTRUCTION and the final clamp
 *  is only ever a backstop. Capping the raw text before escaping (rather than
 *  the escaped output) is what keeps a cut from landing inside an `&amp;`. */
const CAP = { title: 700, culprit: 300, short: 120, link: 500 } as const;

function line(label: string, value: string, cap: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const cut = flat.length <= cap ? flat : `${flat.slice(0, cap - 1)}…`;
  return `<b>${label}:</b> ${escapeHtml(cut)}`;
}

/** Compose the operator-facing message. HTML parse mode — see escapeHtml for
 *  why not MarkdownV2. Every interpolated value is escaped; the only raw
 *  markup is the constant scaffolding written here. */
export function buildAlertHtml(body: unknown, suppressed: number): string {
  const a = parseAlert(body);
  const lines = [
    '🚨 <b>آهن‌تایم — خطای سرور</b>',
    '',
    line('خطا', a.title, CAP.title),
    line('محل', a.culprit, CAP.culprit),
    line('پروژه', a.project, CAP.short),
    line('سطح', a.level, CAP.short),
    line('تعداد رویداد', a.count, CAP.short),
    line('اولین بروز', a.firstSeen, CAP.short),
    line('آخرین بروز', a.lastSeen, CAP.short),
  ].filter((l) => l !== '');

  if (suppressed > 0) {
    // The storm is the signal here, so say so explicitly rather than hiding it
    // in a "+N" suffix the way the 70-char SMS had to.
    lines.push('', `<b>+${suppressed}</b> هشدار دیگر در این بازه ارسال نشد (محدودیت ارسال).`);
  }
  if (a.link) {
    lines.push('', `<a href="${escapeHtml(a.link).replace(/"/g, '&quot;')}">مشاهده در GlitchTip</a>`);
  }
  return lines.join('\n');
}

