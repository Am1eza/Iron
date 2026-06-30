'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { clientLogos, type ClientLogo } from '../../../public/assets/logos/clients';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './ClientCarousel.module.css';

/**
 * Trusted-by carousel — a single row of client logos that advances to the next
 * one every 5s, with prev/next controls. Infinite + seamless (three copies,
 * silently re-centered after each slide). Pauses on hover; under
 * prefers-reduced-motion it stops auto-advancing and the controls page through
 * statically. Companies with a logo file show the logo; the rest show a clean
 * name chip that upgrades automatically once a file is added (see index.ts).
 */
const AUTO_MS = 5000;
const N = clientLogos.length;
const TRIPLE: ClientLogo[] = [...clientLogos, ...clientLogos, ...clientLogos];

function Slide({ c, muted }: { c: ClientLogo; muted: boolean }) {
  const [errored, setErrored] = useState(false);
  const showImg = c.hasLogo && !errored;
  return (
    <li className={styles.slide} aria-hidden={muted ? true : undefined}>
      <div className={styles.cell} title={c.name}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.file}
            alt={c.name}
            className={styles.logo}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setErrored(true)}
          />
        ) : (
          <span className={styles.chip}>
            <span className={styles.mono} aria-hidden="true">{c.monogram}</span>
            <span className={styles.chipName}>{c.nameFa}</span>
          </span>
        )}
      </div>
    </li>
  );
}

export function ClientCarousel() {
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
    if (reduced) return;
    const id = window.setInterval(() => {
      if (!paused.current) {
        setAnim(true);
        setI((v) => v + 1);
      }
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

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

  return (
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
        aria-roledescription="چرخونه لوگوها"
        aria-label="مشتریانی که به آهن‌تایم اعتماد کرده‌اند"
      >
        <ul
          className={styles.track}
          data-anim={anim ? '' : undefined}
          style={{ '--i': i } as CSSProperties}
          onTransitionEnd={onEnd}
        >
          {TRIPLE.map((c, idx) => (
            <Slide key={idx} c={c} muted={idx < N || idx >= 2 * N} />
          ))}
        </ul>
      </div>

      <button type="button" className={styles.nav} aria-label="بعدی" onClick={() => step(1)}>
        <ChevronStartIcon size={22} className="icon--rtl" />
      </button>
    </div>
  );
}
