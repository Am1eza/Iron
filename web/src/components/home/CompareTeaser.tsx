'use client';
import { useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman } from '@/lib/utils/format';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CompareTeaser.module.css';

/**
 * «مقایسهٔ کارخانه‌ها» explorer — the signature capability, one product per
 * slide. Product tabs flip a gunmetal card through every category's real
 * per-mill prices (cheapest tagged, gap to the cheapest spelled out). The CTA
 * deep-links to the full panel (#compare) for the active product. Data is
 * precomputed server-side and passed in — no catalog in the client bundle.
 */
export type CompareSlide = {
  slug: string;
  name: string;
  lines: { factory: string; pricePerKg: number; best: boolean }[];
};

export function CompareTeaser({ slides }: { slides: CompareSlide[] }) {
  const [active, setActive] = useState(0);
  const slide = slides[active];
  if (!slide || slide.lines.length < 2) return null;
  const cheapest = slide.lines[0]!;

  return (
    <section className={styles.section} aria-labelledby="compare-teaser-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <h2 id="compare-teaser-title" className={styles.title}>
            یک محصول، همهٔ کارخانه‌ها
          </h2>
          <p className={styles.sub}>
            قابلیتی که جای دیگری پیدا نمی‌کنید: قیمت روزِ هر کارخانه را کنار هم ببینید، اختلاف را
            بسنجید و با خیال راحت ارزان‌ترین را انتخاب کنید.
          </p>

          <div className={styles.tabs} role="tablist" aria-label="انتخاب محصول برای مقایسه">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={styles.tab}
                data-active={i === active ? '' : undefined}
                onClick={() => setActive(i)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.cardCol}>
          <div key={slide.slug} className={`${styles.card} blueprint`}>
            <header className={styles.cardHead}>
              <span className={styles.cardTitle}>{slide.name}</span>
              <span className={styles.cardMeta}>قیمت هر کیلوگرم · تومان</span>
            </header>

            <ul className={styles.rows}>
              {slide.lines.map((l) => (
                <li key={l.factory} className={styles.row} data-best={l.best ? '' : undefined}>
                  <span className={styles.factory}>
                    {l.factory}
                    {l.best && <span className={styles.bestTag}>ارزان‌ترین</span>}
                  </span>
                  <span className={styles.figures}>
                    <span className={`${styles.price} tnum`}>{formatToman(l.pricePerKg, false)}</span>
                    <span className={`${styles.delta} tnum`}>
                      {l.best ? '' : `${formatToman(l.pricePerKg - cheapest.pricePerKg, false)}+`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <Link href={`${routes.category(slide.slug)}#compare`} className={styles.cta}>
              مقایسهٔ کامل کارخانه‌های {slide.name}
              <ChevronStartIcon size={16} className="icon--rtl" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
