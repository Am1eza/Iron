'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './HeroSearch.module.css';

/**
 * The central AI search (the home's focal point). A clearly-labelled assistant
 * that greets first and asks *what you need* — not just a price box. Submitting
 * opens «آهن‌تایم» (the advisor) with the question. Light, professional, calm.
 */
const STARTERS = [
  'برای یک ساختمان ۲ طبقه چه می‌خواهم؟',
  'قیمت میلگرد ۱۴ امروز؟',
  'وزن ۱۰۰ شاخه میلگرد ۱۶ چقدر است؟',
  'ارزان‌ترین تیرآهن کدام است؟',
];

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ask = (text: string) => {
    const t = text.trim();
    router.push(t ? `${routes.ai()}?q=${encodeURIComponent(t)}` : routes.ai());
  };

  return (
    <section className={styles.hero} aria-label="مشاور هوشمند آهن‌تایم">
      <div className={`container ${styles.inner}`}>
        <p className={styles.badge}>
          <SparkIcon size={15} />
          مشاور هوشمند آهن‌تایم
          <span className={styles.online}>
            <span className={styles.dot} /> آنلاین
          </span>
        </p>

        <h1 className={styles.title}>
          سلام 👋 چه محصولی می‌خواهید بخرید؟
        </h1>
        <p className={styles.sub}>
          فقط قیمت نمی‌دهم — اول می‌پرسم برای چه کاری می‌خواهید، بعد مقدار، وزن و هزینهٔ پروژه را
          مثل یک مشاور خبره برایتان حساب می‌کنم.
        </p>

        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          role="search"
          data-event="ai_entry"
        >
          <span className={styles.searchIcon} aria-hidden>
            <SparkIcon size={22} />
          </span>
          <input
            className={styles.searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً: می‌خوام یه خونه بسازم، چی و چقدر لازم دارم؟"
            aria-label="از مشاور هوشمند آهن‌تایم بپرسید"
            enterKeyHint="send"
          />
          <button type="submit" className={styles.searchSend}>
            <span className={styles.sendText}>بپرس از آهن‌تایم</span>
            <ChevronStartIcon size={18} className="icon--rtl" />
          </button>
        </form>

        <ul className={styles.chips} aria-label="نمونه پرسش‌ها">
          {STARTERS.map((s) => (
            <li key={s}>
              <button type="button" className={styles.chip} onClick={() => ask(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
