'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { api, API_MODE, isApiError } from '@/lib/api';
import { normalizeDigits, toPersianDigits, formatToman } from '@/lib/utils/format';
import { getRows } from '@/lib/mock/catalogData';
import { CATEGORY_ALIASES, PURPOSE_CHIPS } from '@/lib/data/aiTaxonomy';
import { computeBulkSplit, type BulkSplit } from '@/components/catalog/BulkQuote';
import { SparkIcon, ChevronStartIcon, CheckCircleIcon, MicIcon } from '@/components/primitives/icons';
import { getSpeechRecognition, type SpeechRecognitionLike } from '@/lib/utils/speech';
import styles from './AdvisorChat.module.css';

/** Average میلگرد price from the seeded catalog — grounded, never an invented number. */
const AVG_REBAR_PRICE: number = (() => {
  const rows = getRows('rebar');
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((sum, r) => sum + r.current.price, 0) / rows.length);
})();

/**
 * مشاور هوشمند آهن‌تایم — the intent-first advisor. It greets, asks *what you need*
 * before quoting, then helps estimate amount/weight/cost like an expert friend,
 * always offering next steps. In live mode it streams from /api/ai/chat (DeepSeek
 * relay, server-grounded); this local rule engine stays as the zero-cost fallback
 * for mock mode and relay outages, so the advisor never dead-ends.
 */

type Estimate = { items: { name: string; weightKg: number }[]; totalKg: number; totalToman: number };
type SplitAnswer = { categoryName: string; split: BulkSplit };
type Msg = {
  id: string;
  role: 'ai' | 'user';
  text?: string;
  chips?: string[];
  estimate?: Estimate;
  split?: SplitAnswer;
};

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

let seq = 0;
const uid = () => `m${++seq}`;

/* ---- live mode: SSE frames from /api/ai/chat (route.ts contract) ---- */
type ServerEvent =
  | { type: 'conversation'; id: string }
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'lead'; ref?: string; total?: number }
  | { type: 'chips'; chips: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
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
}

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

  // Bulk tonnage ask, e.g. «۲۰ تن میلگرد» → per-factory price split.
  const bulk = detectBulk(t);
  if (bulk) {
    const split = computeBulkSplit(getRows(bulk.slug), bulk.tonnage);
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
const MessageBubble = memo(function MessageBubble({
  message: m,
  onPick,
  hidden,
}: {
  message: Msg;
  onPick: (text: string) => void;
  hidden?: boolean;
}) {
  return (
    <div
      className={`${styles.row} ${styles.rowIn} ${m.role === 'user' ? styles.rowUser : styles.rowAi}`}
      aria-hidden={hidden || undefined}
    >
      {m.role === 'ai' && (
        <span className={styles.bubbleAvatar} aria-hidden>
          <SparkIcon size={14} />
        </span>
      )}
      <div className={styles.bubbleWrap}>
        {m.text && (
          <div className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.ai}`}>
            <span className="visually-hidden">{m.role === 'user' ? 'شما' : 'آهن‌تایم'}: </span>
            {m.text.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
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
      </div>
    </div>
  );
});

export function AdvisorChat({ initialQuestion }: { initialQuestion?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  // The in-progress streamed reply — purely presentational (rendered aria-hidden)
  // so screen readers are never spammed token-by-token. Only once the stream
  // completes does the finished text get pushed into `messages`, which the
  // role="log" region below actually announces (accessibility.md §7).
  const [streamPreview, setStreamPreview] = useState<Msg | null>(null);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const purposeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);
  // Live DeepSeek advisor when configured; the local grounded engine remains the
  // zero-cost fallback — per turn for transient errors, permanently only when the
  // server says it has no relay at all (503 ai_unconfigured). No dead-ends (AC-D-9).
  const useServer = useRef(API_MODE !== 'mock');
  const transcriptRef = useRef<{ role: 'user' | 'ai'; text: string }[]>([]);
  const busyRef = useRef(false);
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

  const pushAi = (msgs: Msg[]) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      msgs.forEach((m) => m.text && transcriptRef.current.push({ role: 'ai', text: m.text }));
      setMessages((m) => [...m, ...msgs]);
    }, 650);
  };

  const sendLocal = (text: string) => {
    const { msgs, purpose } = aiReply(text, { purpose: purposeRef.current });
    purposeRef.current = purpose;
    pushAi(msgs);
  };

  const sendLive = async (text: string) => {
    busyRef.current = true;
    setBusy(true);
    setTyping(true);
    const aiId = uid();
    let streamedText = '';
    let opened = false;
    let chipsBuf: string[] | undefined;
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
    try {
      // Only recent non-empty turns travel (server re-validates) — bounded payload.
      const transcript = transcriptRef.current
        .filter((m) => m.text.trim())
        .slice(-10)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
      const res = await api.ai.chatStream(transcript, { conversationId: conversationIdRef.current });
      if (!res.body) throw new Error('no-body');
      for await (const ev of readSse(res.body)) {
        if (ev.type === 'conversation') {
          conversationIdRef.current = ev.id;
        } else if (ev.type === 'token') {
          streamedText += ev.text;
          if (!opened) open({ text: ev.text });
          else {
            const t = streamedText;
            patchPreview((m) => ({ ...m, text: t }));
          }
        } else if (ev.type === 'lead') {
          if (ev.ref) {
            const amount = ev.total ? ` — مبلغ ${formatToman(ev.total)}` : '';
            leadLine = `درخواستت ثبت شد؛ کد پیگیری: ${toPersianDigits(ev.ref)}${amount}`;
          }
        } else if (ev.type === 'chips') {
          chipsBuf = ev.chips;
          if (opened) patchPreview((m) => ({ ...m, chips: ev.chips }));
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
        // 'tool' frames just keep the typing indicator honest — nothing to render.
      }
      if (leadLine) appendLine(leadLine);
      if (!opened) throw new Error('empty');
      if (streamedText.trim()) transcriptRef.current.push({ role: 'ai', text: streamedText });
      // Streaming is done — clear the presentational preview and commit the
      // FINISHED message into the live region in one shot (one announcement).
      setStreamPreview(null);
      setMessages((all) => [...all, { id: aiId, role: 'ai', text: streamedText, chips: chipsBuf }]);
    } catch (e) {
      // Permanent downgrade ONLY when the server says no relay exists; every
      // transient failure (timeout, 429, network blip) retries next turn.
      if (isApiError(e) && e.status === 503) useServer.current = false;
      setTyping(false);
      if (opened) setStreamPreview(null);
      sendLocal(text);
    } finally {
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
    transcriptRef.current.push({ role: 'user', text });
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    if (useServer.current) void sendLive(text);
    else sendLocal(text);
  };
  // Stable wrapper so `MessageBubble`'s `onPick` prop never changes reference
  // (see MessageBubble's docstring) — `send` itself is recreated every render.
  const sendRef = useRef(send);
  sendRef.current = send;
  const stableSend = useCallback((text: string) => sendRef.current(text), []);

  // First load: greet, then auto-send the question from the home search (if any).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setMessages([
      {
        id: uid(),
        role: 'ai',
        text: 'سلام! من مشاور هوشمند آهن‌تایم‌ام.\nمثل یک دوستِ کاربلد کمکت می‌کنم بهترین خرید را بکنی؛ اول مشورت، بعد خرید.',
        chips: initialQuestion ? undefined : PURPOSE_CHIPS,
      },
    ]);
    if (initialQuestion) window.setTimeout(() => send(initialQuestion), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <span className={styles.avatar} aria-hidden>
          <SparkIcon size={20} />
        </span>
        <div className={styles.headText}>
          <h1 className={styles.headName}>مشاور هوشمند آهن‌تایم</h1>
          <p className={styles.headStatus}>
            <span className={styles.live} /> آنلاین · معمولاً سریع پاسخ می‌دهد
          </p>
        </div>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.thread} role="log" aria-live="polite" aria-atomic="false" aria-relevant="additions">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onPick={stableSend} />
          ))}

          {/* Presentational-only: the token-by-token streaming animation. Marked
              aria-hidden so it is never announced; the finished text lands in
              `messages` above (and is announced once) when the stream ends. */}
          {streamPreview && <MessageBubble message={streamPreview} onPick={stableSend} hidden />}

          {typing && (
            <div className={`${styles.row} ${styles.rowAi}`} aria-hidden="true">
              <span className={styles.bubbleAvatar} aria-hidden>
                <SparkIcon size={14} />
              </span>
              <div className={`${styles.bubble} ${styles.ai} ${styles.typing}`}>
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {typing && (
          <span className="visually-hidden" role="status">
            در حال نوشتن…
          </span>
        )}
      </div>

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
          placeholder={busy ? 'در حال پاسخ…' : 'بنویس… مثلاً: یه خونهٔ ۱۰۰ متری دو طبقه می‌سازم'}
          enterKeyHint="send"
          maxLength={1000}
          disabled={busy}
        />
        {voiceSupported && (
          <button
            type="button"
            className={`${styles.mic} ${listening ? styles.micOn : ''}`}
            onClick={toggleVoice}
            aria-label={listening ? 'توقف ورودی صوتی' : 'ورودی صوتی'}
            aria-pressed={listening}
            disabled={busy}
          >
            <MicIcon size={20} />
          </button>
        )}
        <button type="submit" className={styles.send} aria-label="ارسال" disabled={busy}>
          <ChevronStartIcon size={20} className="icon--rtl" />
        </button>
      </form>
      <p className={styles.disclaimer}>
        پاسخ‌ها بر پایهٔ قیمت‌های واقعی است؛ آهن‌تایم هرگز عدد ساختگی نمی‌سازد.
      </p>
    </div>
  );
}

function QuickReply({ label, onPick }: { label: string; onPick: (t: string) => void }) {
  // Some chips deep-link instead of chatting.
  if (label === 'دریافت پیش‌فاکتور')
    return (
      <Link href={routes.request()} className={`${styles.chip} ${styles.chipCta}`}>
        {label}
      </Link>
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
    return (
      <Link href={routes.category('sheet')} className={styles.chip}>
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
