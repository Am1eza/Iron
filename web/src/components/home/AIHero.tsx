'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './AIHero.module.css';

/**
 * The AI Hero — the home centerpiece and the «AI door». Minimal, premium, and
 * clearly AI (Cobalt + Spark), with a soft animated aurora, a staggered entrance,
 * and an honest grounding promise. Submitting deep-links into «پولادین».
 */
const STARTERS = [
  'برای خانهٔ ۱۲۰ متری چقدر میلگرد لازم دارم؟',
  'قیمت امروز تیرآهن ۱۴ ذوب‌آهن؟',
  'ارزان‌ترین پروفیل برای سوله؟',
];

export function AIHero() {
  const router = useRouter();
  const [q, setQ] = useState('');

  const ask = (text: string) => {
    const term = text.trim();
    router.push(term ? `${routes.ai()}?q=${encodeURIComponent(term)}` : routes.ai());
  };

  return (
    <section className={styles.hero} aria-label="مشاور هوشمند پولادین">
      <div className={styles.aura} aria-hidden="true">
        <span className={styles.blobA} />
        <span className={styles.blobB} />
        <span className={styles.grid} />
      </div>

      <div className={`container ${styles.inner}`}>
        <p className={`${styles.eyebrow} ${styles.rise}`} style={{ '--d': '0ms' } as React.CSSProperties}>
          <span className={styles.live} aria-hidden="true" />
          مشاور هوشمند فولاد · آنلاین
        </p>

        <h1 className={`${styles.title} ${styles.rise}`} style={{ '--d': '80ms' } as React.CSSProperties}>
          نمی‌دانی <span className={styles.accent}>چه بخری</span>؟
          <br />
          از پولادین بپرس.
        </h1>

        <p className={`${styles.sub} ${styles.rise}`} style={{ '--d': '160ms' } as React.CSSProperties}>
          متراژ پروژه‌ات را بگو تا مقدار، وزن و هزینهٔ تقریبی را بر پایهٔ قیمت‌های واقعی امروز
          برایت حساب کنم.
        </p>

        <form
          className={`${styles.ask} ${styles.rise}`}
          style={{ '--d': '240ms' } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          data-event="ai_entry"
        >
          <span className={styles.askIcon} aria-hidden="true">
            <SparkIcon size={20} />
          </span>
          <input
            className={styles.askInput}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً: برای سقف ۸۰ متری چقدر میلگرد می‌خواهم؟"
            aria-label="پرسش از مشاور هوشمند پولادین"
            enterKeyHint="send"
          />
          <button type="submit" className={styles.askSend} aria-label="بپرس">
            <span className={styles.askSendText}>بپرس</span>
            <ChevronStartIcon size={18} className="icon--rtl" />
          </button>
        </form>

        <ul className={`${styles.starters} ${styles.rise}`} style={{ '--d': '320ms' } as React.CSSProperties} aria-label="نمونه پرسش‌ها">
          {STARTERS.map((s) => (
            <li key={s}>
              <button type="button" className={styles.chip} onClick={() => ask(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>

        <p className={`${styles.grounding} ${styles.rise}`} style={{ '--d': '400ms' } as React.CSSProperties}>
          <span className={styles.dot} aria-hidden="true" />
          پاسخ‌ها بر پایهٔ قیمت‌های واقعی است؛ پولادین هرگز عدد نمی‌سازد.
          <Link href={routes.prices()} className={styles.browse}>
            یا خودت جدول قیمت‌ها را ببین
            <ChevronStartIcon size={14} className="icon--rtl" />
          </Link>
        </p>
      </div>
    </section>
  );
}
