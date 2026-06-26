'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { routes } from '@/lib/routes';
import { normalizeDigits, toPersianDigits, formatToman } from '@/lib/utils/format';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './AdvisorChat.module.css';

/**
 * مشاور هوشمند آهن‌تایم — the intent-first advisor. It greets, asks *what you need*
 * before quoting, then helps estimate amount/weight/cost like an expert friend,
 * always offering next steps. This is a grounded MOCK engine (no invented prices —
 * it sends you to the live tables / a human); the DeepSeek relay swaps in later.
 */

type Estimate = { items: { name: string; weightKg: number }[]; totalKg: number; totalToman: number };
type Msg = {
  id: string;
  role: 'ai' | 'user';
  text?: string;
  chips?: string[];
  estimate?: Estimate;
};

let seq = 0;
const uid = () => `m${++seq}`;

const PURPOSE_CHIPS = ['ساختمان مسکونی', 'سوله یا سازهٔ صنعتی', 'بازرگانی و فروش', 'فقط می‌خواهم قیمت ببینم'];

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
  const totalToman = Math.round(totalKg * 31500); // ~rebar price, demo only
  return { items, totalKg, totalToman };
}

function aiReply(text: string, ctx: { purpose: string | null }): { msgs: Msg[]; purpose: string | null } {
  const t = normalizeDigits(text);
  let purpose = ctx.purpose ?? detectPurpose(t);

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
          text: `برای حدود ${toPersianDigits(area)} متر${floors > 1 ? ` و ${toPersianDigits(floors)} طبقه` : ''}، یک برآورد تقریبی آماده کردم 👇 این عددها «تخمینی» است؛ برای قیمت دقیق همین حالا می‌توانم درخواستت را ثبت کنم تا کارشناس نهایی کند.`,
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

export function AdvisorChat({ initialQuestion }: { initialQuestion?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const purposeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  const pushAi = (msgs: Msg[]) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((m) => [...m, ...msgs]);
    }, 650);
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    const { msgs, purpose } = aiReply(text, { purpose: purposeRef.current });
    purposeRef.current = purpose;
    pushAi(msgs);
  };

  // First load: greet, then auto-send the question from the home search (if any).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setMessages([
      {
        id: uid(),
        role: 'ai',
        text: 'سلام! من مشاور هوشمند آهن‌تایم‌ام 👋\nمثل یک دوستِ کاربلد کمکت می‌کنم بهترین خرید را بکنی — اول مشورت، بعد خرید.',
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
          <p className={styles.headName}>مشاور هوشمند آهن‌تایم</p>
          <p className={styles.headStatus}>
            <span className={styles.live} /> آنلاین · معمولاً سریع پاسخ می‌دهد
          </p>
        </div>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.thread}>
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                className={`${styles.row} ${m.role === 'user' ? styles.rowUser : styles.rowAi}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {m.role === 'ai' && (
                  <span className={styles.bubbleAvatar} aria-hidden>
                    <SparkIcon size={14} />
                  </span>
                )}
                <div className={styles.bubbleWrap}>
                  {m.text && (
                    <div className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.ai}`}>
                      {m.text.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}
                  {m.estimate && <EstimateCard est={m.estimate} />}
                  {m.chips && (
                    <div className={styles.chips}>
                      {m.chips.map((c) => (
                        <QuickReply key={c} label={c} onPick={send} />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
            <div className={`${styles.row} ${styles.rowAi}`}>
              <span className={styles.bubbleAvatar} aria-hidden>
                <SparkIcon size={14} />
              </span>
              <div className={`${styles.bubble} ${styles.ai} ${styles.typing}`} aria-label="در حال نوشتن">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="بنویس… مثلاً: یه خونهٔ ۱۰۰ متری دو طبقه می‌سازم"
          aria-label="پیام به مشاور هوشمند"
          enterKeyHint="send"
        />
        <button type="submit" className={styles.send} aria-label="ارسال">
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
