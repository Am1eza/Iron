'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { routes } from '@/lib/routes';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { CategoryArt } from '@/components/catalog/CategoryArt';
import { ProductImage } from '@/components/catalog/ProductImage';
import { productImage } from '@/lib/data/productImages';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './ProductStrip.module.css';

/**
 * Product strip — an auto-advancing horizontal rail of ALL product categories
 * (photo + name) placed immediately under the AI hero. No category is the
 * default; every product is shown moving. Reuses the ClientCarousel state machine
 * (tripled array, silent re-centering on transitionEnd, 5s auto-advance,
 * prev/next, pause-on-hover, edge fade, reduced-motion safe). Each card keeps the
 * signature interaction: hover → sub-categories peek; click → that price table.
 */
const AUTO_MS = 5000;

function Card({ cat, muted }: { cat: Category; muted: boolean }) {
  const subs = CATEGORY_SUBS[cat.slug] ?? [];
  return (
    <li className={styles.slide} aria-hidden={muted ? true : undefined}>
      <Link
        href={routes.category(cat.slug)}
        className={styles.card}
        tabIndex={muted ? -1 : undefined}
        data-event="strip_category_click"
      >
        <span className={styles.art}>
          {productImage(cat.slug) ? (
            <ProductImage slug={cat.slug} name={cat.name} />
          ) : (
            <CategoryArt slug={cat.slug} size={72} />
          )}
        </span>
        <span className={styles.body}>
          <span className={styles.name}>{cat.name}</span>
          <span className={styles.cta}>
            مشاهده قیمت روز
            <ChevronStartIcon size={15} className="icon--rtl" />
          </span>
        </span>
        {/* sub-categories peek on hover/focus */}
        <span className={styles.peek} aria-hidden="true">
          <span className={styles.peekTitle}>{cat.name}</span>
          <span className={styles.peekSubs}>
            {subs.slice(0, 5).map((s) => (
              <span key={s.slug} className={styles.peekChip}>
                {s.name}
              </span>
            ))}
          </span>
          <span className={styles.peekCta}>
            مشاهده جدول قیمت
            <ChevronStartIcon size={15} className="icon--rtl" />
          </span>
        </span>
      </Link>
    </li>
  );
}

export function ProductStrip({ categories }: { categories: Category[] }) {
  const N = categories.length;
  const triple = N ? [...categories, ...categories, ...categories] : [];
  const [i, setI] = useState(N); // start inside the middle copy
  const [anim, setAnim] = useState(true);
  const reduced = useReducedMotion();
  const paused = useRef(false);

  const step = useCallback((dir: 1 | -1) => {
    setAnim(true);
    setI((v) => v + dir);
  }, []);

  // auto-advance every 5s (skipped while hovered/focused or reduced-motion)
  useEffect(() => {
    if (reduced || !N) return;
    const id = window.setInterval(() => {
      if (!paused.current) {
        setAnim(true);
        setI((v) => v + 1);
      }
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [reduced, N]);

  // re-enable animation on the frame after a silent re-center
  useEffect(() => {
    if (!anim) {
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
      return () => cancelAnimationFrame(r);
    }
  }, [anim]);

  const onEnd = (e: React.TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (i >= 2 * N) {
      setAnim(false);
      setI(i - N);
    } else if (i < N) {
      setAnim(false);
      setI(i + N);
    }
  };

  const pause = () => (paused.current = true);
  const resume = () => (paused.current = false);

  if (!N) return null;

  return (
    <section className={styles.section} aria-labelledby="strip-title">
      <div className={`container ${styles.head}`}>
        <div>
          <p className={styles.eyebrow}>محصولات آهن‌تایم</p>
          <h2 id="strip-title" className={styles.title}>
            قیمت روز هر محصول، یک کلیک تا جدول
          </h2>
        </div>
        <p className={styles.hint}>روی هر محصول بروید تا زیرشاخه‌ها را ببینید؛ کلیک = جدول قیمت.</p>
      </div>

      <div className={styles.wrap}>
        <button type="button" className={styles.nav} aria-label="قبلی" onClick={() => step(-1)}>
          <ChevronEndIcon size={22} className="icon--rtl" />
        </button>

        <div
          className={styles.viewport}
          onMouseEnter={pause}
          onMouseLeave={resume}
          onFocusCapture={pause}
          onBlurCapture={resume}
          role="group"
          aria-roledescription="چرخونه محصولات"
          aria-label="محصولات آهن‌تایم"
        >
          <ul
            className={styles.track}
            data-anim={anim ? '' : undefined}
            style={{ '--i': i } as CSSProperties}
            onTransitionEnd={onEnd}
          >
            {triple.map((cat, idx) => (
              <Card key={idx} cat={cat} muted={idx < N || idx >= 2 * N} />
            ))}
          </ul>
        </div>

        <button type="button" className={styles.nav} aria-label="بعدی" onClick={() => step(1)}>
          <ChevronStartIcon size={22} className="icon--rtl" />
        </button>
      </div>
    </section>
  );
}
