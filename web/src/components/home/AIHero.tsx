'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './AIHero.module.css';

/**
 * The AI Hero (N14) — the home centerpiece and the «AI door». A conversational
 * entry that is *clearly* AI (Cobalt + Spark, an honest grounding promise), with a
 * large prompt field and starter chips. Submitting deep-links into «پولادین».
 * A parallel «structured door» link sends Pros straight to the price tables.
 */
const STARTERS = [
  'برای یک خانهٔ ۱۲۰ متری چقدر میلگرد لازم دارم؟',
  'قیمت امروز تیرآهن ۱۴ ذوب‌آهن؟',
  'ارزان‌ترین پروفیل برای سوله کدام است؟',
  'فرق میلگرد A3 و A4 چیست؟',
];

export function AIHero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [q, setQ] = useState('');

  const ask = (text: string) => {
    const term = text.trim();
    router.push(term ? `${routes.ai()}?q=${encodeURIComponent(term)}` : routes.ai());
  };

  return (
    <section className={styles.hero} aria-label="مشاور هوشمند پولادین">
      <div className={`container ${styles.inner}`}>
        <p className={styles.eyebrow}>
          <span className={`${styles.orb} ${reduced ? '' : styles.orbPulse}`} aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          مشاور هوشمند فولاد · آنلاین
        </p>

        <h1 className={styles.title}>
          نمی‌دانی <span className={styles.accent}>چه بخری</span>؟ از پولادین بپرس.
        </h1>
        <p className={styles.sub}>
          متراژ پروژه‌ات را بگو تا مقدار، وزن و هزینهٔ تقریبی را بر پایهٔ قیمت‌های واقعی امروز
          برایت حساب کنم. اول مشورت، بعد خرید.
        </p>

        {/* The AI prompt field */}
        <form
          className={styles.ask}
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          data-event="ai_entry"
        >
          <span className={styles.askIcon} aria-hidden="true">
            <SparkIcon size={22} />
          </span>
          <input
            className={styles.askInput}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً: برای سقف ۸۰ متری چقدر میلگرد و تیرآهن می‌خواهم؟"
            aria-label="پرسش از مشاور هوشمند پولادین"
            enterKeyHint="send"
          />
          <button type="submit" className={styles.askSend}>
            بپرس
            <ChevronStartIcon size={18} className="icon--rtl" />
          </button>
        </form>

        {/* Starter chips */}
        <ul className={styles.starters} aria-label="نمونه پرسش‌ها">
          {STARTERS.map((s) => (
            <li key={s}>
              <button type="button" className={styles.chip} onClick={() => ask(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>

        {/* Honesty + structured door */}
        <div className={styles.foot}>
          <p className={styles.grounding}>
            <span className={styles.dot} aria-hidden="true" />
            پاسخ‌ها بر پایهٔ قیمت‌های واقعی است؛ پولادین هرگز عدد نمی‌سازد.
          </p>
          <Link href={routes.prices()} className={styles.browse}>
            ترجیح می‌دهی خودت ببینی؟ جدول قیمت‌ها
            <ChevronStartIcon size={16} className="icon--rtl" />
          </Link>
        </div>
      </div>
    </section>
  );
}
