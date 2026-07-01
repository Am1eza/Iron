'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { SparkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './HeroSearch.module.css';

/**
 * The «Steel Terminal» hero — an asymmetric split. Inline-start column: the brand
 * claim in Estedad Black + the AI search (the primary action) + starter chips.
 * The other column hosts the live PriceBoard (passed in as a server-rendered
 * slot). Start-aligned, no centered stack, price data as the visual anchor.
 */
const STARTERS = [
  'برای یک ساختمان ۲ طبقه چه می‌خواهم؟',
  'قیمت میلگرد ۱۴ امروز؟',
  'ارزان‌ترین تیرآهن کدام است؟',
];

export function HeroSearch({ board }: { board?: ReactNode }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ask = (text: string) => {
    const t = text.trim();
    router.push(t ? `${routes.ai()}?q=${encodeURIComponent(t)}` : routes.ai());
  };

  return (
    <section className={styles.hero} aria-label="آهن‌تایم — بازار هوشمند فولاد">
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <h1 className={styles.title}>
            قیمت روزِ فولاد،
            <br />
            با یک مشاور هوشمند
          </h1>
          <p className={styles.sub}>
            میلگرد، تیرآهن، ورق و پروفیل، مستقیم از کارخانه. بگویید برای چه کاری می‌خواهید تا
            مقدار، وزن و هزینهٔ پروژه را حساب کنیم.
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

        {board && <div className={styles.boardCol}>{board}</div>}
      </div>
    </section>
  );
}
