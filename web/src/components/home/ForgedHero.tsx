'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  motion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { routes } from '@/lib/routes';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ForgedHero.module.css';

const LINE1 = ['اول', 'مشورت،'];
const LINE2 = ['بعد', 'خرید.'];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const word: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(14px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
  },
};
const fade: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

const CHIPS = [
  { label: 'دلار', value: '۸۲٬۳۵۰', dir: 'up' as const, top: '24%', side: '8%' },
  { label: 'طلای ۱۸', value: '۳٬۸۵۰٬۰۰۰', dir: 'down' as const, top: '62%', side: '12%' },
  { label: 'شمش فولاد', value: '۲۸۵٬۰۰۰', dir: 'up' as const, top: '38%', side: '78%' },
];

export function ForgedHero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [q, setQ] = useState('');
  const heroRef = useRef<HTMLElement | null>(null);

  // Cursor-reactive heat glow
  const mx = useMotionValue(50);
  const my = useMotionValue(35);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });
  const glow = useMotionTemplate`radial-gradient(560px circle at ${sx}% ${sy}%, rgba(245,150,30,0.16), rgba(46,107,255,0.06) 35%, transparent 62%)`;

  const onMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  const ask = (text: string) => {
    const t = text.trim();
    router.push(t ? `${routes.ai()}?q=${encodeURIComponent(t)}` : routes.ai());
  };

  return (
    <section ref={heroRef} className={styles.hero} onMouseMove={onMove} aria-label="مشاور هوشمند پولادین">
      {/* Layers */}
      <motion.div className={styles.glow} style={{ background: glow }} aria-hidden />
      <div className={styles.grid} aria-hidden />
      <div className={styles.vignette} aria-hidden />
      {/* Polished steel beam with traveling highlight */}
      <div className={styles.beam} aria-hidden>
        <span className={styles.beamLight} />
      </div>

      {/* Drifting live-price chips */}
      {CHIPS.map((c, i) => (
        <motion.div
          key={c.label}
          className={styles.chip}
          style={{ top: c.top, insetInlineStart: c.side }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={
            reduced
              ? { opacity: 1, scale: 1 }
              : { opacity: 1, scale: 1, y: [0, -10, 0] }
          }
          transition={
            reduced
              ? { delay: 0.6 + i * 0.15, duration: 0.6 }
              : { opacity: { delay: 0.8 + i * 0.2 }, scale: { delay: 0.8 + i * 0.2 }, y: { duration: 6 + i, repeat: Infinity, ease: 'easeInOut' } }
          }
          aria-hidden
        >
          <span className={styles.chipLabel}>{c.label}</span>
          <span className={`${styles.chipVal} tnum`}>{c.value}</span>
          <span className={c.dir === 'up' ? styles.up : styles.down}>{c.dir === 'up' ? '▲' : '▼'}</span>
        </motion.div>
      ))}

      <motion.div
        className={`container ${styles.inner}`}
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.p className={styles.eyebrow} variants={fade}>
          <span className={styles.live} />
          مشاور هوشمند فولاد
        </motion.p>

        <h1 className={styles.title}>
          <span className={styles.line}>
            {LINE1.map((w) => (
              <motion.span key={w} className={styles.w} variants={word}>
                {w}&nbsp;
              </motion.span>
            ))}
          </span>
          <span className={styles.line}>
            {LINE2.map((w, i) => (
              <motion.span
                key={w}
                className={`${styles.w} ${i === 1 ? styles.forge : ''}`}
                variants={word}
              >
                {w}&nbsp;
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p className={styles.sub} variants={fade}>
          متراژ پروژه‌ات را بگو تا مقدار، وزن و هزینه را بر پایهٔ قیمت‌های واقعی امروز برایت حساب کنم.
        </motion.p>

        {/* AI prompt — the single focal action */}
        <motion.form
          className={styles.ask}
          variants={fade}
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          data-event="ai_entry"
        >
          <span className={styles.askIcon} aria-hidden>
            <SparkIcon size={20} />
          </span>
          <input
            className={styles.askInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً: برای سقف ۸۰ متری چقدر میلگرد می‌خواهم؟"
            aria-label="پرسش از پولادین"
            enterKeyHint="send"
          />
          <MagneticButton reduced={!!reduced} />
        </motion.form>

        <motion.div className={styles.meta} variants={fade}>
          <span className={styles.ground}>
            <span className={styles.dot} /> پاسخ‌ها بر پایهٔ قیمت واقعی است؛ هرگز عدد ساختگی نمی‌سازم.
          </span>
          <Link href={routes.prices()} className={styles.browse}>
            یا قیمت‌ها را ببین
            <ChevronStartIcon size={15} className="icon--rtl" />
          </Link>
        </motion.div>
      </motion.div>

      <div className={styles.scrollCue} aria-hidden>
        <span>{toPersianDigits('۷')} دسته فولادی</span>
        <span className={styles.cueLine} />
      </div>
    </section>
  );
}

/** A magnetic submit button that leans toward the cursor (spring). */
function MagneticButton({ reduced }: { reduced: boolean }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 14 });
  const sy = useSpring(y, { stiffness: 220, damping: 14 });
  const ref = useRef<HTMLButtonElement | null>(null);

  const move = (e: React.MouseEvent) => {
    if (reduced) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - (r.left + r.width / 2)) * 0.35);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      type="submit"
      className={styles.askSend}
      style={{ x: sx, y: sy }}
      onMouseMove={move}
      onMouseLeave={reset}
      aria-label="بپرس"
    >
      <span className={styles.askSendText}>بپرس</span>
      <ChevronStartIcon size={18} className="icon--rtl" />
    </motion.button>
  );
}
