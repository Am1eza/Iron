'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { api, API_MODE, isApiError } from '@/lib/api';
import { normalizeDigits, toPersianDigits, formatToman } from '@/lib/utils/format';
import { getRows } from '@/lib/mock/catalogData';
import type { PriceRow } from '@/lib/types/domain';
import { CATEGORY_ALIASES, PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
import { computeBulkSplit, type BulkSplit } from '@/components/catalog/BulkQuote';
import { pickBestGroup } from '@/lib/utils/bulkSplit';
import { AiMarkIcon, ChevronStartIcon, CheckCircleIcon, MicIcon } from '@/components/primitives/icons';
import { getSpeechRecognition, type SpeechRecognitionLike } from '@/lib/utils/speech';
import { ChatMarkdown } from './ChatMarkdown';
import { loadChat, saveChat, clearChat } from '@/lib/ai/chatStorage';
import styles from './AdvisorChat.module.css';
import { trackGoal } from '@/lib/analytics/track';

/** Average میلگرد price from the seeded catalog — grounded, never an invented number. */
const AVG_REBAR_PRICE: number = (() => {
  const rows = getRows('rebar');
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((sum, r) => sum + r.current.price, 0) / rows.length);
})();

/**
 * مشاور هوشمند آهن‌تایم — the intent-first advisor. It greets, asks *what you need*
 * before quoting, then helps estimate amount/weight/cost like an expert friend,
 * always offering next steps. In live mode it streams from /api/ai/chat (relay,
 * server-grounded); this local rule engine stays as the zero-cost fallback
 * for mock mode and relay outages, so the advisor never dead-ends.
 */

type Estimate = { items: { name: string; weightKg: number }[]; totalKg: number; totalToman: number };
type SplitAnswer = { categoryName: string; split: BulkSplit };
export type Msg = {
  id: string;
  role: 'ai' | 'user';
  text?: string;
  chips?: string[];
  estimate?: Estimate;
  split?: SplitAnswer;
  /** Server answer id (from the stream's `done` frame) — present only on
   *  committed live AI answers, enables 👍/👎 feedback. */
  dbMessageId?: string;
  conversationId?: string;
  /** Set only on a turn where the LIVE advisor failed — carries why, and the
   *  text to replay. Absent on every normal answer, so nothing is shown. */
  notice?: TurnNotice;
};

/** The opening greeting — shared so it can be rendered server-side (crawlable
 *  initial HTML) and reused as the client fallback if no SSR message is passed. */
export const GREETING_TEXT =
  'سلام! من مشاور هوشمند آهن‌تایم‌ام.\nمثل یک دوستِ کاربلد کمکت می‌کنم بهترین خرید را بکنی؛ اول مشورت، بعد خرید.';

/** Detect «۲۰ تن میلگرد» → tonnage + category (shared alias table — no drift
 *  with the server tools). Returns null if not a bulk ask. */
function detectBulk(t: string): { tonnage: number; slug: string; name: string } | null {
  const tonMatch = t.match(/(\d{1,5}(?:\.\d+)?)\s*تن/);
  if (!tonMatch) return null;
  const tonnage = Number(tonMatch[1]);
  if (!Number.isFinite(tonnage) || tonnage <= 0) return null;
  const cat = CATEGORY_ALIASES.find((c) => c.re.test(t));
  if (!cat) return null;
  return { tonnage, slug: cat.slug, name: cat.name };
}

/** Normalize a user-typed dimension separator («x», «X», «*») to the «×» the
 *  mock catalog's SIZES table uses, and strip stray whitespace. */
function normalizeSizeToken(raw: string): string {
  return raw.replace(/[xX*]/g, '×').replace(/\s+/g, '');
}

/** Every size-shaped substring the text could contain, most specific first
 *  (dimension pairs and inch fractions before a bare number) — tried in order
 *  against the category's real size set so «۴۰×۴۰» isn't reduced to «۴۰».
 *  `t` arrives ALREADY digit-normalized (aiReply's `normalizeDigits(text)`
 *  runs before this is ever called) — Latin digits only, hence [0-9] here,
 *  not the Persian range the mock catalog's own SIZES table is written in. */
function extractSizeCandidates(t: string): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(/[0-9]+\s*[×xX*]\s*[0-9]+/g)) out.push(normalizeSizeToken(m[0]));
  for (const m of t.matchAll(/[0-9]+(?:\/[0-9]+)?\s*اینچ/g)) out.push(m[0].replace(/\s+/g, ' ').trim());
  for (const m of t.matchAll(/[0-9]+(?:\.[0-9]+)?/g)) out.push(m[0]);
  return out;
}

/**
 * A single, specific SKU — «میلگرد ۱۴ راد همدان چنده» rather than a bare
 * category — resolved from the mock catalog (see the BASE_PRICE freshness
 * note in catalogData.ts). Deliberately conservative: answers ONLY when the
 * user named both a factory AND a size AND exactly one row matches both, so
 * the offline engine never guesses a specific number for an ambiguous ask —
 * an ambiguous or partial match falls through to the normal purpose flow
 * instead of a confident-looking wrong price.
 */
function detectSpecificSku(t: string): PriceRow | null {
  const cat = CATEGORY_ALIASES.find((c) => c.re.test(t));
  if (!cat) return null;
  const rows = getRows(cat.slug);
  const factory = rows.find((r) => r.factory && t.includes(r.factory))?.factory;
  if (!factory) return null;
  // Rows carry Persian-digit sizes («۱۴») straight from SIZES — normalize
  // to compare against the already-Latin-digit `t`.
  const sizeOf = new Map(rows.map((r) => [r, r.size ? normalizeDigits(r.size) : null] as const));
  const candidates = extractSizeCandidates(t);
  const size = candidates.find((c) => [...sizeOf.values()].includes(c));
  if (!size) return null;
  const matches = rows.filter((r) => r.factory === factory && sizeOf.get(r) === size);
  return matches.length === 1 ? matches[0]! : null;
}

let seq = 0;
const uid = () => `m${++seq}`;

/* ---- live mode: SSE frames from /api/ai/chat (route.ts contract) ---- */
type ServerEvent =
  | { type: 'conversation'; id: string }
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'lead'; ref?: string; total?: number }
  | { type: 'chips'; chips: string[] }
  | { type: 'done'; messageId?: string }
  | { type: 'error'; message: string };

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          yield JSON.parse(line.slice(6)) as ServerEvent;
        } catch {
          /* skip malformed frame */
        }
      }
    }
  } finally {
    // The consumer leaves this loop early on an `error` frame (it throws) and
    // on abort — for-await then calls the generator's `return()`, which lands
    // here. Without this the reader stayed locked and the response body was
    // never released, holding the connection open for a request that is
    // already over.
    reader.cancel().catch(() => {});
  }
}

/** An `{type:'error'}` SSE frame — i.e. the server reached us and explained
 *  itself. Distinct from a transport failure so the two can be told apart:
 *  a plain `Error` here used to be indistinguishable from `fetch` throwing. */
class StreamErrorFrame extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamErrorFrame';
  }
}

/* ---- turn-level failure reporting ---- */
/**
 * Why a live turn didn't produce a live answer. The advisor NEVER dead-ends
 * (the local grounded engine always answers), but silently swapping in a
 * lesser answer taught the visitor nothing: every message the server writes
 * for these cases — including the one it goes out of its way to phrase around
 * the human path — was being discarded by the client and shown nowhere.
 *
 * These are deliberately NOT alarming and NOT modal: a small line under the
 * one affected reply, phrased as a state, not an apology. `rate_limited` is
 * the only kind that states a wait, because it is the only kind where waiting
 * is what actually fixes it and the server tells us how long (Retry-After).
 */
type NoticeKind = 'fallback' | 'rate_limited' | 'offline' | 'dropped';

export type TurnNotice = {
  kind: NoticeKind;
  /** The user text that produced this turn — replayed by «تلاش دوباره». */
  retryOf: string;
  /** Epoch ms before which a retry is pointless (rate limit only). */
  retryAfterMs?: number;
};

const NOTICE_TEXT: Record<NoticeKind, string> = {
  // The relay is down/over budget/timed out. The visitor cannot act on which,
  // so this says what they CAN see: this answer came from the offline engine.
  fallback: 'این پاسخ نسخهٔ محلی است؛ دستیار هوشمند در دسترس نبود.',
  rate_limited: 'پیام‌ها پشت‌سرهم ارسال شد. کمی صبر کن و دوباره بفرست.',
  offline: 'اتصال اینترنت قطع بود؛ این پاسخ نسخهٔ محلی است.',
  // A genuine mid-stream drop — the partial answer above is REAL model output,
  // so it is kept rather than thrown away and replaced by a lesser one.
  dropped: 'پاسخ ناتمام ماند؛ اتصال وسط دریافت قطع شد.',
};

/** Tool frames are the ONLY progress signal during the wait — measured live at
 *  2–45s between the request and the first token, because every number is
 *  validated server-side before ANY text is allowed out (grounding, AC-D-3),
 *  so the text necessarily arrives as one burst at the end. They used to be
 *  read and thrown away, leaving a bare three-dot indicator for the whole
 *  wait. Naming the actual work is honest and makes a long wait legible. */
const TOOL_PROGRESS: Record<string, string> = {
  getPrice: 'در حال بررسی قیمت‌های امروز…',
  calcWeight: 'در حال محاسبهٔ وزن…',
  estimateProject: 'در حال برآورد پروژه…',
  createLead: 'در حال ثبت درخواست…',
  compareFactories: 'در حال مقایسهٔ کارخانه‌ها…',
  searchGuides: 'در حال مرور راهنماها…',
};
const PROGRESS_DEFAULT = 'در حال نوشتن…';
/** After this long with no answer, say so. A 45s server deadline is a normal
 *  tail event on this reasoning model (measured 6.8s / 48.8s / 6.7s on three
 *  identical requests), and unexplained silence reads as "broken". Shown
 *  ALONGSIDE the tool label rather than replacing it — which tool is running
 *  is the more useful fact, and a frozen-looking label is exactly the thing
 *  this reassurance exists to answer. */
const SLOW_HINT_MS = 12_000;
const SLOW_HINT = 'کمی طول می‌کشد؛ ممنون از صبرت.';
/** No frame at all for this long means the connection is hung rather than
 *  slow: the server's own deadline is AI_TIMEOUT_MS (45s) and it always
 *  answers with an `error` frame, so past that + margin nothing is coming.
 *  Without this the composer stayed disabled forever behind a dead socket. */
const STALL_TIMEOUT_MS = 70_000;

function detectPurpose(t: string): 'building' | 'industrial' | 'trade' | 'price' | null {
  if (/خانه|خونه|ساختمان|مسکونی|سقف|طبقه|ویلا|بنا/.test(t)) return 'building';
  if (/سوله|صنعتی|کارگاه|سازه|اسکلت/.test(t)) return 'industrial';
  if (/بازرگان|فروش|عمده|تاجر|صادرات/.test(t)) return 'trade';
  if (/فقط|قیمت|نرخ/.test(t)) return 'price';
  return null;
}

/** Very rough demo BOM from area×floors — labelled «تخمینی», never a firm quote. */
function buildEstimate(areaM2: number, floors: number): Estimate {
  const built = areaM2 * Math.max(1, floors);
  const rebarKg = Math.round(built * 22);
  const beamKg = Math.round(built * 14);
  const items = [
    { name: 'میلگرد', weightKg: rebarKg },
    { name: 'تیرآهن', weightKg: beamKg },
  ];
  const totalKg = rebarKg + beamKg;
  const totalToman = Math.round(totalKg * AVG_REBAR_PRICE); // grounded in the live catalog avg
  return { items, totalKg, totalToman };
}

function aiReply(text: string, ctx: { purpose: string | null }): { msgs: Msg[]; purpose: string | null } {
  const t = normalizeDigits(text);
  const purpose = ctx.purpose ?? detectPurpose(t);

  // Bulk tonnage ask, e.g. «۲۰ تن میلگرد» → per-factory price split. Narrowed
  // to the single most-quoted sub-category first — blending a mill's price
  // across entirely different sub-categories would average non-equivalent
  // products into a misleading "cheapest" (see lib/utils/bulkSplit.ts).
  const bulk = detectBulk(t);
  if (bulk) {
    const bulkRows = getRows(bulk.slug);
    const bulkGroup = pickBestGroup(bulkRows);
    const bulkScoped = bulkGroup ? bulkRows.filter((r) => r.subCategoryId === bulkGroup.subCategoryId) : bulkRows;
    const split = computeBulkSplit(bulkScoped, bulk.tonnage);
    if (split.cheapest) {
      return {
        purpose,
        msgs: [
          {
            id: uid(),
            role: 'ai',
            text: `برای ${toPersianDigits(bulk.tonnage)} تن ${bulk.name}، قیمت روز را به تفکیک کارخانه حساب کردم؛ ارزان‌ترین گزینه را برایت مشخص کرده‌ام. این اعداد تخمینی‌اند؛ نرخ نهایی را کارشناس تأیید می‌کند.`,
            split: { categoryName: bulk.name, split },
            chips: ['دریافت پیش‌فاکتور', `قیمت ${bulk.name}`],
          },
        ],
      };
    }
  }

  // A specific, named SKU («میلگرد ۱۴ راد همدان») outranks the generic
  // purpose flow below — that flow can only ask "which product?" back, which
  // is a dead end when the user already named one.
  const specific = detectSpecificSku(t);
  if (specific) {
    return {
      purpose,
      msgs: [
        {
          id: uid(),
          role: 'ai',
          text: `${specific.name} (${specific.factory}) طبق آخرین به‌روزرسانی حدود ${formatToman(specific.current.price)} است. این عدد تخمینی است و ممکن است لحظه‌ای نباشد؛ برای نرخ دقیق «دریافت پیش‌فاکتور» را بزن.`,
          chips: ['دریافت پیش‌فاکتور', 'همهٔ قیمت‌ها'],
        },
      ],
    };
  }

  // Did they give an area (and maybe floors)?
  const area = Number(t.match(/(\d{2,5})\s*(?:متر|m2|مترمربع|متری)/)?.[1] ?? '');
  const floors = Number(t.match(/(\d{1,2})\s*طبقه/)?.[1] ?? '1');

  if ((purpose === 'building' || purpose === 'industrial') && area) {
    const est = buildEstimate(area, floors || 1);
    return {
      purpose,
      msgs: [
        {
          id: uid(),
          role: 'ai',
          text: `برای حدود ${toPersianDigits(area)} متر${floors > 1 ? ` و ${toPersianDigits(floors)} طبقه` : ''}، یک برآورد تقریبی آماده کردم. این عددها «تخمینی» است؛ برای قیمت دقیق همین حالا می‌توانم درخواستت را ثبت کنم تا کارشناس نهایی کند.`,
          estimate: est,
          chips: ['دریافت پیش‌فاکتور', 'وزن دقیق را حساب کن', 'قیمت میلگرد امروز'],
        },
      ],
    };
  }

  if (!purpose) {
    return {
      purpose: null,
      msgs: [
        {
          id: uid(),
          role: 'ai',
          text: 'حتماً کمکت می‌کنم! فقط قبل از قیمت، بگو آهن را برای چه کاری می‌خواهی تا دقیق راهنماییت کنم:',
          chips: PURPOSE_CHIPS,
        },
      ],
    };
  }

  if (purpose === 'price') {
    return {
      purpose,
      msgs: [
        {
          id: uid(),
          role: 'ai',
          text: 'باشه! قیمت کدام محصول را می‌خواهی؟ جدول‌ها لحظه‌ای و شفاف‌اند:',
          chips: ['قیمت میلگرد', 'قیمت تیرآهن', 'قیمت ورق', 'همهٔ قیمت‌ها'],
        },
      ],
    };
  }

  // building/industrial but no area yet
  return {
    purpose,
    msgs: [
      {
        id: uid(),
        role: 'ai',
        text:
          purpose === 'building'
            ? 'عالی! برای یک ساختمان معمولاً میلگرد، تیرآهن و ورق لازم می‌شود. متراژ زیربنا و تعداد طبقات را بگو تا مقدار، وزن و هزینهٔ تقریبی را برایت حساب کنم.'
            : 'خوبه! برای سوله معمولاً تیرآهن/هاش، پروفیل و ورق لازم است. ابعاد یا متراژ تقریبی را بگو تا برآورد کنم.',
        chips: ['مثلاً ۱۲۰ متر، ۲ طبقه', 'مثلاً ۲۰۰ متر'],
      },
    ],
  };
}

/**
 * One thread row (user or آهن‌تایم), memoized. `hidden` renders it aria-hidden
 * for the presentational in-progress streaming preview (`streamPreview`
 * below) — the finished message is what actually lands in the role="log"
 * region and gets announced, once. Messages committed to `messages` keep
 * their exact same object reference across a `setMessages` update unless
 * they're the one that changed, so `React.memo`'s default shallow-prop
 * comparison lets the rest of a long thread skip re-rendering on every SSE
 * token instead of re-rendering the whole thread. `onPick` must stay
 * referentially stable for that to hold (see `stableSend` in `AdvisorChat`)
 * — otherwise every row would see a "changed" prop on every render
 * regardless of whether its own message changed.
 */
/** 👍/👎 on a committed AI answer. Fire-and-forget POST to /api/ai/feedback;
 *  optimistic + one-shot (disabled after a choice). Feeds the admin review loop. */
function FeedbackButtons({ messageId, conversationId }: { messageId: string; conversationId?: string }) {
  const [sent, setSent] = useState<'up' | 'down' | null>(null);
  const submit = (rating: 'up' | 'down') => {
    if (sent) return;
    setSent(rating);
    void fetch('/api/ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, conversationId, rating }),
    }).catch(() => {
      /* best-effort — keep the optimistic UI even if the beacon fails */
    });
  };
  return (
    <div className={styles.feedback} role="group" aria-label="این پاسخ چطور بود؟">
      <button
        type="button"
        className={styles.feedbackBtn}
        data-active={sent === 'up' ? '' : undefined}
        aria-pressed={sent === 'up'}
        aria-label="پاسخ مفید بود"
        disabled={sent !== null}
        onClick={() => submit('up')}
      >
        👍
      </button>
      <button
        type="button"
        className={styles.feedbackBtn}
        data-active={sent === 'down' ? '' : undefined}
        aria-pressed={sent === 'down'}
        aria-label="پاسخ مفید نبود"
        disabled={sent !== null}
        onClick={() => submit('down')}
      >
        👎
      </button>
      {sent && <span className={styles.feedbackThanks}>ممنون از بازخوردتان</span>}
    </div>
  );
}

/**
 * The one-line "this turn didn't come from the live advisor" note, plus its
 * retry. Deliberately quiet: no icon-heavy alert, no colour that reads as
 * danger — the visitor DID get an answer, and the business's real fallback
 * (a human) is already one chip away.
 *
 * Not a live region: it is committed together with the message the role="log"
 * thread announces, so it is read as part of that one announcement instead of
 * interrupting with a second one.
 */
function TurnNoticeRow({ notice, onRetry }: { notice: TurnNotice; onRetry: () => void }) {
  // Rate limits are the only case with a real wait to count down. Ticks once a
  // second only while a wait is actually pending, then stops.
  const [now, setNow] = useState(() => Date.now());
  const waitMs = notice.retryAfterMs ? notice.retryAfterMs - now : 0;
  const waiting = waitMs > 0;
  useEffect(() => {
    if (!notice.retryAfterMs) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [notice.retryAfterMs]);

  const secs = Math.ceil(waitMs / 1000);
  return (
    <div className={styles.notice} data-kind={notice.kind}>
      <span className={styles.noticeText}>
        {NOTICE_TEXT[notice.kind]}
        {waiting && ` (${toPersianDigits(secs)} ثانیه)`}
      </span>
      <button
        type="button"
        className={styles.noticeRetry}
        onClick={onRetry}
        disabled={waiting}
        // The countdown is decoration; the label carries the state for AT.
        aria-label={
          waiting ? `تلاش دوباره، ${toPersianDigits(secs)} ثانیه دیگر` : 'تلاش دوباره برای پاسخ هوشمند'
        }
      >
        {notice.kind === 'dropped' ? 'ادامه بده' : 'تلاش دوباره'}
      </button>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message: m,
  onPick,
  onRetry,
  hidden,
}: {
  message: Msg;
  onPick: (text: string) => void;
  onRetry: (m: Msg) => void;
  hidden?: boolean;
}) {
  return (
    <div
      className={`${styles.row} ${styles.rowIn} ${m.role === 'user' ? styles.rowUser : styles.rowAi}`}
      aria-hidden={hidden || undefined}
    >
      {m.role === 'ai' && (
        <span className={styles.bubbleAvatar} aria-hidden>
          <AiMarkIcon size={14} />
        </span>
      )}
      <div className={styles.bubbleWrap}>
        {m.text && (
          <div className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.ai}`}>
            <span className="visually-hidden">{m.role === 'user' ? 'شما' : 'آهن‌تایم'}: </span>
            {m.role === 'ai' ? (
              // Advisor replies carry markdown (tables/lists/bold) — rendered
              // through the safe subset renderer, never as raw asterisks. The
              // aria-hidden streaming preview (`hidden`) additionally repairs
              // half-open syntax so the tail never flashes as literal `**`.
              <ChatMarkdown text={m.text} streaming={hidden} />
            ) : (
              m.text.split('\n').map((line, i) => <p key={i}>{line}</p>)
            )}
          </div>
        )}
        {m.estimate && <EstimateCard est={m.estimate} />}
        {m.split && <SplitCard answer={m.split} />}
        {m.chips && (
          <div className={styles.chips}>
            {m.chips.map((c) => (
              <QuickReply key={c} label={c} onPick={onPick} />
            ))}
          </div>
        )}
        {m.notice && !hidden && <TurnNoticeRow notice={m.notice} onRetry={() => onRetry(m)} />}
        {m.role === 'ai' && m.dbMessageId && (
          <FeedbackButtons messageId={m.dbMessageId} conversationId={m.conversationId} />
        )}
      </div>
    </div>
  );
});

export function AdvisorChat({
  initialQuestion,
  initialMessages,
}: {
  initialQuestion?: string;
  /** Server-rendered greeting (see app/ai/page.tsx) so the advisor's opening
   *  message is present in the initial HTML, not only injected client-side. */
  initialMessages?: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(() => initialMessages ?? []);
  // The in-progress streamed reply — purely presentational (rendered aria-hidden)
  // so screen readers are never spammed token-by-token. Only once the stream
  // completes does the finished text get pushed into `messages`, which the
  // role="log" region below actually announces (accessibility.md §7).
  const [streamPreview, setStreamPreview] = useState<Msg | null>(null);
  const [typing, setTyping] = useState(false);
  // What the advisor is actually doing right now, driven by the server's
  // `tool` frames (see TOOL_PROGRESS) — the wait is 2–45s and used to be
  // three anonymous dots for all of it.
  const [progress, setProgress] = useState<string>(PROGRESS_DEFAULT);
  const [slow, setSlow] = useState(false);
  // navigator.onLine is only a link-layer signal (a captive portal still reads
  // "online"), so it is used to PREVENT a send that is certain to fail and to
  // auto-recover — never as proof that a request will succeed. Seeded true for
  // SSR/first paint so the composer is never disabled before hydration.
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const purposeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);
  // Live relay advisor when configured; the local grounded engine remains the
  // zero-cost fallback — per turn for transient errors, permanently only when the
  // server says it has no relay at all (503 ai_unconfigured). No dead-ends (AC-D-9).
  const useServer = useRef(API_MODE !== 'mock');
  const transcriptRef = useRef<{ role: 'user' | 'ai'; text: string }[]>([]);
  const busyRef = useRef(false);
  // Lets the user stop an in-flight answer (WCAG/UX — no forced wait).
  const abortRef = useRef<AbortController | null>(null);
  // The stall watchdog aborts through the SAME controller as the stop button,
  // so this marks which one fired — otherwise a hung connection would be
  // treated as "the user pressed stop" and silently produce no answer at all.
  const stalledRef = useRef(false);
  // Server-issued conversation id ({type:'conversation'} frame) — echoed on
  // later turns so the server keeps persistence + rolling-summary continuity.
  const conversationIdRef = useRef<string | undefined>(undefined);
  // Voice input (Web Speech API) — پیمانکار با دست‌های سیمانی تایپ نمی‌کند.
  // Feature-detected AFTER mount (SSR renders without window); unsupported
  // browsers simply never see the mic button. One utterance lands in the
  // input for review — it is NEVER auto-sent.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.abort();
  }, []);

  // Connectivity. Read AFTER mount (SSR has no navigator) and then follow the
  // events — recovery is instant, so a visitor who steps into a lift does not
  // have to work out for themselves that the composer works again.
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = 'fa-IR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    // onend also fires after onerror (mic denied, no speech) — one cleanup path.
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  };

  const pushAi = (msgs: Msg[], notice?: TurnNotice) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      msgs.forEach((m) => m.text && transcriptRef.current.push({ role: 'ai', text: m.text }));
      // The note rides on the LAST message of the turn so it reads as a
      // footnote to the answer rather than a header above it.
      setMessages((m) => [
        ...m,
        ...msgs.map((msg, i) => (notice && i === msgs.length - 1 ? { ...msg, notice } : msg)),
      ]);
    }, 650);
  };

  const sendLocal = (text: string, notice?: TurnNotice) => {
    const { msgs, purpose } = aiReply(text, { purpose: purposeRef.current });
    purposeRef.current = purpose;
    pushAi(msgs, notice);
  };

  const sendLive = async (text: string) => {
    busyRef.current = true;
    setBusy(true);
    setTyping(true);
    setProgress(PROGRESS_DEFAULT);
    setSlow(false);
    const aiId = uid();
    // Escalate the wait copy once, and only if the answer really is slow.
    const slowHint = window.setTimeout(() => setSlow(true), SLOW_HINT_MS);
    // Watchdog: a hung connection produces no frames and no error, so nothing
    // else would ever resolve this turn. Rearmed on every frame received.
    let stall: number | null = null;
    const armStall = () => {
      if (stall !== null) window.clearTimeout(stall);
      stall = window.setTimeout(() => {
        stalledRef.current = true;
        abortRef.current?.abort();
      }, STALL_TIMEOUT_MS);
    };
    const clearTimers = () => {
      window.clearTimeout(slowHint);
      if (stall !== null) window.clearTimeout(stall);
      stall = null;
    };
    stalledRef.current = false;
    let streamedText = '';
    let opened = false;
    let chipsBuf: string[] | undefined;
    let dbMessageId: string | undefined;
    // The server always emits 'lead' (during tool execution) strictly BEFORE
    // any 'token' (the buffered, sanitized final text) — so it's held and
    // appended after the model's own prose instead of rendering it first.
    let leadLine: string | null = null;
    // These mutate ONLY the presentational preview (aria-hidden, not the
    // role="log" region) — the finished message is committed to `messages`
    // (and thus announced) a single time, after the stream ends.
    const patchPreview = (fn: (m: Msg) => Msg) =>
      setStreamPreview((m) => (m ? fn(m) : m));
    const open = (init: Partial<Msg> = {}) => {
      opened = true;
      setTyping(false);
      setStreamPreview({ id: aiId, role: 'ai', ...init });
    };
    const appendLine = (line: string) => {
      streamedText = streamedText ? `${streamedText}\n${line}` : line;
      const t = streamedText;
      if (!opened) open({ text: t });
      else patchPreview((m) => ({ ...m, text: t }));
    };
    // Paint the preview at most every ~80ms (reading speed), not per token —
    // per-token setState re-parses the growing markdown dozens of times a
    // second for churn nobody can read.
    let lastPaint = 0;
    let paintTimer: number | null = null;
    const paint = () => {
      lastPaint = Date.now();
      const t = streamedText;
      if (!opened) open({ text: t });
      else patchPreview((m) => ({ ...m, text: t }));
    };
    const schedulePaint = () => {
      const since = Date.now() - lastPaint;
      if (since >= 80) {
        if (paintTimer !== null) {
          window.clearTimeout(paintTimer);
          paintTimer = null;
        }
        paint();
      } else if (paintTimer === null) {
        paintTimer = window.setTimeout(() => {
          paintTimer = null;
          paint();
        }, 80 - since);
      }
    };
    const stopPaint = () => {
      if (paintTimer !== null) {
        window.clearTimeout(paintTimer);
        paintTimer = null;
      }
    };
    try {
      // Only recent non-empty turns travel (server re-validates) — bounded payload.
      const transcript = transcriptRef.current
        .filter((m) => m.text.trim())
        .slice(-10)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await api.ai.chatStream(transcript, {
        conversationId: conversationIdRef.current,
        signal: controller.signal,
      });
      if (!res.body) throw new Error('no-body');
      armStall();
      for await (const ev of readSse(res.body)) {
        armStall();
        if (ev.type === 'tool') {
          // Name the work in flight instead of discarding the frame.
          const label = TOOL_PROGRESS[ev.name];
          if (label) setProgress(label);
        } else if (ev.type === 'conversation') {
          conversationIdRef.current = ev.id;
        } else if (ev.type === 'token') {
          streamedText += ev.text;
          schedulePaint();
        } else if (ev.type === 'lead') {
          if (ev.ref) {
            const amount = ev.total ? `، مبلغ ${formatToman(ev.total)}` : '';
            leadLine = `درخواستت ثبت شد؛ کد پیگیری: ${toPersianDigits(ev.ref)}${amount}`;
          }
        } else if (ev.type === 'chips') {
          chipsBuf = ev.chips;
          if (opened) patchPreview((m) => ({ ...m, chips: ev.chips }));
        } else if (ev.type === 'done') {
          dbMessageId = ev.messageId;
        } else if (ev.type === 'error') {
          // Carries the server's own Persian copy (relay down / over budget /
          // past the AI_TIMEOUT_MS deadline). Tagged so the catch below can
          // tell it apart from a transport failure.
          throw new StreamErrorFrame(ev.message);
        }
      }
      clearTimers();
      stopPaint(); // the commit below carries the full text — no late repaint
      if (leadLine) appendLine(leadLine);
      if (!opened) throw new Error('empty');
      if (streamedText.trim()) transcriptRef.current.push({ role: 'ai', text: streamedText });
      // Streaming is done — clear the presentational preview and commit the
      // FINISHED message into the live region in one shot (one announcement).
      setStreamPreview(null);
      setMessages((all) => [
        ...all,
        { id: aiId, role: 'ai', text: streamedText, chips: chipsBuf, dbMessageId, conversationId: conversationIdRef.current },
      ]);
    } catch (e) {
      clearTimers();
      stopPaint();
      const stalled = stalledRef.current;
      stalledRef.current = false;
      const aborted =
        !stalled &&
        (abortRef.current?.signal.aborted || (e instanceof DOMException && e.name === 'AbortError'));
      if (aborted) {
        // User pressed stop — keep whatever streamed so far, no fallback, no error.
        setTyping(false);
        setStreamPreview(null);
        if (streamedText.trim()) {
          transcriptRef.current.push({ role: 'ai', text: streamedText });
          setMessages((all) => [
            ...all,
            { id: aiId, role: 'ai', text: streamedText, chips: chipsBuf, dbMessageId, conversationId: conversationIdRef.current },
          ]);
        }
        return;
      }
      // Permanent downgrade ONLY when the server says no relay exists; every
      // transient failure (timeout, 429, network blip) retries next turn.
      if (isApiError(e) && e.status === 503) useServer.current = false;
      setTyping(false);

      // Classify. `StreamErrorFrame` means the SERVER answered and explained
      // itself (relay down / deadline) — the transport was fine. Anything that
      // is neither that nor an ApiError got here from fetch/read throwing,
      // i.e. the connection itself failed.
      const serverSpoke = e instanceof StreamErrorFrame || isApiError(e);
      const rateLimited = isApiError(e) && e.status === 429;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      const transportFailed = stalled || (!serverSpoke && !(e instanceof Error && e.message === 'empty'));

      const notice: TurnNotice = {
        kind: rateLimited
          ? 'rate_limited'
          : offline
            ? 'offline'
            : transportFailed && streamedText.trim()
              ? 'dropped'
              : transportFailed
                ? 'offline'
                : 'fallback',
        retryOf: text,
        ...(rateLimited && isApiError(e) && e.retryAfterSeconds
          ? // The server states the real wait in Retry-After (300s here); the
            // JSON body only says «کمی بعد». Cap the countdown so a large
            // server-side window can't present as an unusable dead button.
            { retryAfterMs: Date.now() + Math.min(e.retryAfterSeconds, 60) * 1000 }
          : {}),
      };

      // A genuine mid-stream drop that already delivered real model output:
      // KEEP it (same reasoning as the user-abort path directly above) rather
      // than discarding real text and answering with the lesser local engine.
      if (notice.kind === 'dropped') {
        setStreamPreview(null);
        transcriptRef.current.push({ role: 'ai', text: streamedText });
        setMessages((all) => [
          ...all,
          { id: aiId, role: 'ai', text: streamedText, chips: chipsBuf, conversationId: conversationIdRef.current, notice },
        ]);
        return;
      }

      if (opened) setStreamPreview(null);
      sendLocal(text, notice);
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  const send = (raw: string) => {
    const text = raw.trim().slice(0, 1000);
    if (!text || busyRef.current) return;
    setInput('');
    // Track the stated purpose on BOTH paths so a mid-conversation fallback
    // to the local engine doesn't restart the intent-first questioning.
    purposeRef.current = purposeRef.current ?? detectPurpose(normalizeDigits(text));
    // Conversion: the FIRST message only — a conversation is the goal, not
    // each turn of it (transcriptRef is still empty at this point on turn 1).
    if (transcriptRef.current.length === 0) trackGoal('ai-chat', 'first-message', purposeRef.current ?? 'general');
    transcriptRef.current.push({ role: 'user', text });
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    if (useServer.current) void sendLive(text);
    else sendLocal(text);
  };
  /**
   * Replay the turn that fell back, live this time. The failed answer is
   * REMOVED (both from the thread and from the transcript the server sees) so
   * a retry replaces it rather than stacking a second answer to one question —
   * and so the local engine's wording never becomes context the model then
   * builds on. The user's own message stays; it is not re-sent as a new turn.
   */
  const retryTurn = (failed: Msg) => {
    if (busyRef.current || !failed.notice) return;
    const text = failed.notice.retryOf;
    // Drop the failed answer from the model-visible transcript. It is the last
    // 'ai' entry, and only ever one entry (pushAi pushes each message's text).
    const lastAi = transcriptRef.current.map((t) => t.role).lastIndexOf('ai');
    if (lastAi !== -1) transcriptRef.current.splice(lastAi, 1);
    setMessages((all) => all.filter((m) => m.id !== failed.id));
    // `useServer` may have been switched off permanently by a 503; a retry is
    // an explicit request for the live advisor, so give it one more chance.
    useServer.current = API_MODE !== 'mock';
    void sendLive(text);
  };

  // Stable wrappers so `MessageBubble`'s props never change reference (see
  // MessageBubble's docstring) — both are recreated every render.
  const sendRef = useRef(send);
  sendRef.current = send;
  const stableSend = useCallback((text: string) => sendRef.current(text), []);
  const retryRef = useRef(retryTurn);
  retryRef.current = retryTurn;
  const stableRetry = useCallback((m: Msg) => retryRef.current(m), []);

  // Start a fresh thread — clears the persisted client copy and the server
  // conversation id so the next message opens a new conversation row.
  const resetChat = () => {
    clearChat();
    conversationIdRef.current = undefined;
    transcriptRef.current = [];
    purposeRef.current = null;
    setStreamPreview(null);
    setMessages([{ id: uid(), role: 'ai', text: GREETING_TEXT, chips: PURPOSE_CHIPS }]);
  };

  // First load: greet (unless the server already rendered it — see
  // `initialMessages`), then auto-send the question from the home search (if any).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Restore a persisted conversation so leaving/reloading the page doesn't
    // erase the chat (the server persists it too; this is the client view).
    const saved = loadChat();
    if (saved && saved.messages.length > 0) {
      setMessages(saved.messages);
      conversationIdRef.current = saved.conversationId;
      transcriptRef.current = saved.transcript ?? [];
      if (initialQuestion) window.setTimeout(() => send(initialQuestion), 500);
      return;
    }
    if (!initialMessages) {
      setMessages([
        {
          id: uid(),
          role: 'ai',
          text: GREETING_TEXT,
          chips: initialQuestion ? undefined : PURPOSE_CHIPS,
        },
      ]);
    }
    if (initialQuestion) window.setTimeout(() => send(initialQuestion), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  // Persist the committed transcript + conversation id (survives navigation /
  // reload). saveChat skips an empty thread, so the greeting seed is a no-op.
  useEffect(() => {
    if (!started.current) return;
    saveChat({
      messages,
      conversationId: conversationIdRef.current,
      transcript: transcriptRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <span className={styles.avatar} aria-hidden>
          <AiMarkIcon size={20} />
        </span>
        <div className={styles.headText}>
          <h1 className={styles.headName}>مشاور هوشمند آهن‌تایم</h1>
          <p className={styles.headStatus}>
            <span className={styles.live} /> آنلاین · معمولاً سریع پاسخ می‌دهد
          </p>
        </div>
        <button type="button" className={styles.newChat} onClick={resetChat}>
          گفتگوی جدید
        </button>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.thread} role="log" aria-live="polite" aria-atomic="false" aria-relevant="additions">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onPick={stableSend} onRetry={stableRetry} />
          ))}

          {/* Presentational-only: the token-by-token streaming animation. Marked
              aria-hidden so it is never announced; the finished text lands in
              `messages` above (and is announced once) when the stream ends. */}
          {streamPreview && (
            <MessageBubble message={streamPreview} onPick={stableSend} onRetry={stableRetry} hidden />
          )}

          {typing && (
            <div className={`${styles.row} ${styles.rowAi}`} aria-hidden="true">
              <span className={styles.bubbleAvatar} aria-hidden>
                <AiMarkIcon size={14} />
              </span>
              <div className={`${styles.bubble} ${styles.ai} ${styles.typingRow}`}>
                <span className={styles.typing}>
                  <span />
                  <span />
                  <span />
                </span>
                {/* What the advisor is actually doing (server `tool` frames). */}
                <span className={styles.progressText}>
                  {progress}
                  {slow && <span className={styles.progressSlow}>{SLOW_HINT}</span>}
                </span>
              </div>
            </div>
          )}
        </div>

        {typing && (
          // Announces the same state the sighted user reads. Changes at most a
          // few times per turn (tool switch, then the one slow-hint), so it
          // stays informative without becoming chatter.
          <span className="visually-hidden" role="status">
            {slow ? `${progress} ${SLOW_HINT}` : progress}
          </span>
        )}
      </div>

      {!online && (
        // Unmissable but not dramatic, and it sits directly above the control
        // it explains. role="status" (not "alert") — losing signal is a state,
        // not an emergency, and this must not steal focus mid-conversation.
        <p className={styles.offlineBar} role="status">
          اتصال اینترنت قطع است؛ به‌محض وصل‌شدن دوباره می‌توانی پیام بفرستی.
        </p>
      )}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          پیام به مشاور هوشمند
        </label>
        <input
          id="chat-input"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            !online
              ? 'اتصال اینترنت قطع است…'
              : busy
                ? 'در حال پاسخ…'
                : 'بنویس… مثلاً: یه خونهٔ ۱۰۰ متری دو طبقه می‌سازم'
          }
          enterKeyHint="send"
          maxLength={1000}
          disabled={busy || !online}
        />
        {voiceSupported && (
          <button
            type="button"
            className={`${styles.mic} ${listening ? styles.micOn : ''}`}
            onClick={toggleVoice}
            aria-label={listening ? 'توقف ورودی صوتی' : 'ورودی صوتی'}
            aria-pressed={listening}
            disabled={busy || !online}
          >
            <MicIcon size={20} />
          </button>
        )}
        {busy ? (
          <button
            type="button"
            className={styles.send}
            aria-label="توقف پاسخ"
            onClick={() => abortRef.current?.abort()}
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>
              ⏹
            </span>
          </button>
        ) : (
          <button type="submit" className={styles.send} aria-label="ارسال" disabled={!online}>
            <ChevronStartIcon size={20} className="icon--rtl" />
          </button>
        )}
      </form>
      <p className={styles.disclaimer}>
        پاسخ‌ها بر پایهٔ قیمت‌های واقعی است؛ آهن‌تایم هرگز عدد ساختگی نمی‌سازد.
      </p>
    </div>
  );
}

function QuickReply({ label, onPick }: { label: string; onPick: (t: string) => void }) {
  // Some chips deep-link instead of chatting. «دریافت پیش‌فاکتور» is
  // deliberately NOT one of them: it used to jump straight to /request,
  // which reads the sitewide inquiry basket — not this conversation — so a
  // visitor who'd just asked about one specific SKU landed on a form about
  // whatever (if anything) happened to already be in their basket, with no
  // mention of what they came here to ask about. Sending it as a normal
  // chat turn instead keeps the createLead tool call in THIS conversation,
  // grounded in the exact item/size/factory just discussed.
  if (label === 'دریافت پیش‌فاکتور')
    return (
      <button type="button" className={`${styles.chip} ${styles.chipCta}`} onClick={() => onPick(label)}>
        {label}
      </button>
    );
  if (label === 'قیمت میلگرد' || label === 'قیمت میلگرد امروز')
    return (
      <Link href={routes.category('rebar')} className={styles.chip}>
        {label}
      </Link>
    );
  if (label === 'قیمت تیرآهن')
    return (
      <Link href={routes.category('ibeam')} className={styles.chip}>
        {label}
      </Link>
    );
  if (label === 'قیمت ورق')
    // 'sheet' is the retired slug (is_active = false; see FOOTER's split into
    // varagh-garm/varagh-sard/varagh-steel). 'varagh-garm' is the closest live
    // equivalent for a generic «ورق» ask — the mock bulk-quote engine above
    // still keys its internal split calc on the old 'sheet' slug, which is
    // fine (self-contained mock lookup); only this deep link must resolve.
    return (
      <Link href={routes.category('varagh-garm')} className={styles.chip}>
        {label}
      </Link>
    );
  if (label === 'همهٔ قیمت‌ها')
    return (
      <Link href={routes.prices()} className={styles.chip}>
        {label}
      </Link>
    );
  if (label === 'وزن دقیق را حساب کن')
    return (
      <Link href={routes.tool('weight')} className={styles.chip}>
        {label}
      </Link>
    );
  return (
    <button type="button" className={styles.chip} onClick={() => onPick(label)}>
      {label}
    </button>
  );
}

function EstimateCard({ est }: { est: Estimate }) {
  return (
    <div className={styles.estimate}>
      <div className={styles.estHead}>
        <span className={styles.estBadge}>برآورد تخمینی</span>
      </div>
      <ul className={styles.estItems}>
        {est.items.map((it) => (
          <li key={it.name}>
            <span>{it.name}</span>
            <span className="tnum">{toPersianDigits(it.weightKg.toLocaleString('en-US'))} کیلوگرم</span>
          </li>
        ))}
      </ul>
      <div className={styles.estTotals}>
        <div>
          <span className={styles.estLabel}>وزن کل</span>
          <span className={`${styles.estValue} tnum`}>
            {toPersianDigits(est.totalKg.toLocaleString('en-US'))} کیلوگرم
          </span>
        </div>
        <div>
          <span className={styles.estLabel}>هزینهٔ تقریبی</span>
          <span className={`${styles.estValue} tnum`}>{formatToman(est.totalToman)}</span>
        </div>
      </div>
      <div className={styles.estActions}>
        <Link href={routes.request()} className={styles.estCta}>
          دریافت پیش‌فاکتور دقیق
        </Link>
        <Link href={routes.contact()} className={styles.estGhost}>
          گفتگو با کارشناس
        </Link>
      </div>
    </div>
  );
}

function SplitCard({ answer }: { answer: SplitAnswer }) {
  const { categoryName, split } = answer;
  return (
    <div className={styles.estimate}>
      <div className={styles.estHead}>
        <span className={styles.estBadge}>
          {toPersianDigits(split.tonnage)} تن {categoryName} · تفکیک کارخانه
        </span>
      </div>
      <ul className={styles.splitList}>
        {split.lines.map((l) => (
          <li key={l.factory} className={l.best ? styles.splitBest : undefined}>
            <span className={styles.splitFactory}>
              {l.factory}
              {l.best ? <span className={styles.splitTag}>بهترین</span> : null}
            </span>
            <span className="tnum">{formatToman(l.lineToman)}</span>
          </li>
        ))}
      </ul>
      {split.cheapest ? (
        <div className={styles.splitSuggest}>
          <CheckCircleIcon size={15} aria-hidden="true" />
          <span>
            ارزان‌ترین: کارخانهٔ <strong>{split.cheapest.factory}</strong> با{' '}
            <strong className="tnum">{formatToman(split.cheapest.pricePerKg, false)}</strong> تومان
            بر کیلوگرم.
          </span>
        </div>
      ) : null}
      <div className={styles.estActions}>
        <Link href={routes.request()} className={styles.estCta}>
          دریافت پیش‌فاکتور
        </Link>
        <Link href={routes.contact()} className={styles.estGhost}>
          گفتگو با کارشناس
        </Link>
      </div>
    </div>
  );
}
