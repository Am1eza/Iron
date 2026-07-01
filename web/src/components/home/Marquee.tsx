'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './Marquee.module.css';

/**
 * Robust, seamless marquee. The item list is rendered THREE times so the strip is
 * always wider than the viewport; the loop is always contiguous. A single
 * requestAnimationFrame loop eases `pos` toward `goal` and writes
 * `track.style.transform` (a string assignment that can't throw). The displayed
 * phase is `pos mod period`, so the transform is ALWAYS within one copy — it can
 * never run off into blank space, no matter the timing. Content drifts to the
 * RIGHT (items enter from the left, exit on the right). «بعدی» advances (right),
 * «قبلی» goes back (left). Pauses on hover/focus and when the tab is hidden. Under
 * `prefers-reduced-motion` the loop is off and the strip is a swipeable row.
 *
 * No CSS mask on the moving layer (mask + transform can blank a composited layer
 * on some GPUs) — the edge fade is a plain overlay instead. Markup is identical on
 * server and client (only the JS loop is gated on reduced-motion).
 */
const COPIES = 3;

export function Marquee({
  items,
  ariaLabel,
  speed = 40,
}: {
  items: ReactNode[];
  ariaLabel?: string;
  speed?: number; // px per second
}) {
  const reduced = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const paused = useRef(false);
  const pos = useRef(0);
  const goal = useRef(0);
  const period = useRef(0);
  const n = Math.max(1, items.length);

  // Exact width of ONE copy including the gap that follows it.
  const measure = () => {
    const track = trackRef.current;
    if (!track || track.children.length <= n) return;
    const first = track.children[0] as HTMLElement;
    const nextCopy = track.children[n] as HTMLElement;
    const p = nextCopy.offsetLeft - first.offsetLeft;
    if (p > 0) period.current = p;
  };

  useEffect(() => {
    if (reduced) return;
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const track = trackRef.current;
      if (!track) return;
      if (period.current <= 0) measure();
      const per = period.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (per > 0) {
        if (!paused.current && !document.hidden) goal.current += speed * dt; // drift right
        pos.current += (goal.current - pos.current) * Math.min(1, dt * 12);
        // phase is always in [0, per) → transform can never leave the content
        const phase = ((pos.current % per) + per) % per;
        track.style.transform = `translateX(${phase - per}px)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [reduced, speed, n]);

  // dir: +1 = «بعدی» (advance / right), -1 = «قبلی» (back / left)
  const nudge = (dir: 1 | -1) => {
    if (reduced) {
      const vp = viewportRef.current;
      vp?.scrollBy({ left: -dir * Math.round((vp.clientWidth || 240) * 0.6), behavior: 'smooth' });
      return;
    }
    const per = period.current;
    goal.current += dir * (per > 0 ? per / n : 180);
  };

  const renderCopy = (copy: number) =>
    items.map((node, i) => (
      <li
        key={copy + '-' + i}
        className={styles.item}
        aria-hidden={copy > 0 ? true : undefined}
      >
        {node}
      </li>
    ));

  return (
    <div className={styles.wrap}>
      {/* right side in RTL — moves content left (back) */}
      <button type="button" className={styles.nav} aria-label="قبلی" onClick={() => nudge(-1)}>
        <ChevronEndIcon size={22} />
      </button>

      <div
        ref={viewportRef}
        className={styles.viewport}
        data-reduced={reduced ? '' : undefined}
        onMouseEnter={() => (paused.current = true)}
        onMouseLeave={() => (paused.current = false)}
        onFocusCapture={() => (paused.current = true)}
        onBlurCapture={() => (paused.current = false)}
        role="group"
        aria-label={ariaLabel}
      >
        <span className={`${styles.fade} ${styles.fadeStart}`} aria-hidden="true" />
        <ul ref={trackRef} className={styles.track}>
          {Array.from({ length: COPIES }, (_, c) => renderCopy(c))}
        </ul>
        <span className={`${styles.fade} ${styles.fadeEnd}`} aria-hidden="true" />
      </div>

      {/* left side in RTL — moves content right (forward) */}
      <button type="button" className={styles.nav} aria-label="بعدی" onClick={() => nudge(1)}>
        <ChevronStartIcon size={22} />
      </button>
    </div>
  );
}
