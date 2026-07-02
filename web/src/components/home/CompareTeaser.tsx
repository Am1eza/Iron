'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatToman } from '@/lib/utils/format';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
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

const AUTO_MS = 6000;

export function CompareTeaser({ slides }: { slides: CompareSlide[] }) {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = slides.length;

  // Auto-advance like a slideshow; hover pauses, manual selection resets the
  // clock, reduced-motion disables it entirely.
  useEffect(() => {
    if (reduced || n < 2) return;
    const start = () => {
      timer.current = setInterval(() => {
        if (!paused.current && !document.hidden) setActive((v) => (v + 1) % n);
      }, AUTO_MS);
    };
    start();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, n]);

  const pick = (i: number, focusTab = false) => {
    setActive(i);
    // manual choice restarts the countdown so it doesn't flip right away
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        if (!paused.current && !document.hidden) setActive((v) => (v + 1) % n);
      }, AUTO_MS);
    }
    if (focusTab) {
      // wait for the newly-active tab's tabIndex=0 to land before moving focus
      requestAnimationFrame(() => tabRefs.current[i]?.focus());
    }
  };

  // Standard ARIA tablist keyboard pattern (roving tabindex + arrow keys) —
  // Left/Right alone isn't enough here since the page is RTL: the tab visually
  // to the LEFT is the NEXT one in reading order, so Left advances forward.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = (i + 1) % n;
    else if (e.key === 'ArrowRight') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next !== null) {
      e.preventDefault();
      pick(next, true);
    }
  };

  const slide = slides[active];
  if (!slide || slide.lines.length < 2) return null;
  const cheapest = slide.lines[0]!;

  return (
    <section
      className={styles.section}
      aria-labelledby="compare-teaser-title"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <h2 id="compare-teaser-title" className={styles.title}>
            یک محصول، همهٔ کارخانه‌ها
          </h2>
          <p className={styles.sub}>
            قیمت روز هر کارخانه را کنار هم ببینید، اختلاف را بسنجید و ارزان‌ترین را انتخاب کنید.
          </p>

          <div className={styles.tabs} role="tablist" aria-label="انتخاب محصول برای مقایسه">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                ref={(el) => { tabRefs.current[i] = el; }}
                type="button"
                id={`compare-tab-${s.slug}`}
                role="tab"
                aria-selected={i === active}
                aria-controls={`compare-panel-${s.slug}`}
                tabIndex={i === active ? 0 : -1}
                className={styles.tab}
                data-active={i === active ? '' : undefined}
                onClick={() => pick(i)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.cardCol}>
          <div
            key={slide.slug}
            role="tabpanel"
            id={`compare-panel-${slide.slug}`}
            aria-labelledby={`compare-tab-${slide.slug}`}
            className={`${styles.card} blueprint`}
          >
            <header className={styles.cardHead}>
              <span className={styles.cardTitle}>{slide.name}</span>
              <span className={styles.cardMeta}>تومان بر کیلوگرم</span>
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
