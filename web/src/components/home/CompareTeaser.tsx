'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { formatToman } from '@/lib/utils/format';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { FactoryLink } from '@/components/catalog/FactoryLink';
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
  // Mill names and SKU names inside this card stay Persian — they come from
  // the catalog. Only the surrounding chrome is translated.
  const t = useTranslations('home.compare');
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = slides.length;

  // Auto-advance ONLY until the visitor first interacts — a carousel that
  // keeps flipping under someone mid-read is an interruption, and hover-pause
  // never worked on touch. Reduced-motion disables it entirely.
  useEffect(() => {
    if (reduced || n < 2) return;
    timer.current = setInterval(() => {
      if (!paused.current && !document.hidden) setActive((v) => (v + 1) % n);
    }, AUTO_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [reduced, n]);

  const pick = (i: number, focusTab = false) => {
    setActive(i);
    // A manual choice means the visitor is engaged — stop the slideshow for good.
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
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
      // Keyboard users have no hover: without these the panel swapped itself
      // out every 6s while they were reading it (WCAG 2.2.2). Mirrors
      // Marquee.tsx, which already pairs focus with mouse.
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
    >
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <h2 id="compare-teaser-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.sub}>{t('sub')}</p>

          <div className={styles.tabs} role="tablist" aria-label={t('tabsAria')}>
            {slides.map((s, i) => (
              <button
                key={s.slug}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
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
              <span className={styles.cardMeta}>{t('perKg')}</span>
            </header>

            <ul className={styles.rows}>
              {slide.lines.map((l) => (
                <li key={l.factory} className={styles.row} data-best={l.best ? '' : undefined}>
                  <span className={styles.factory}>
                    {/* This card is the site's mill-comparison surface — the
                        one place a visitor is actively weighing mills against
                        each other — so a mill name here is exactly where the
                        next click wants to go: that mill's own page in this
                        category. `slide.slug` is the category slug. */}
                    <FactoryLink
                      categorySlug={slide.slug}
                      factory={l.factory}
                      className={styles.factoryLink}
                    />
                    {l.best && <span className={styles.bestTag}>{t('cheapest')}</span>}
                  </span>
                  <span className={styles.figures}>
                    <span className={`${styles.price} tnum`}>
                      {formatToman(l.pricePerKg, false)}
                    </span>
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
