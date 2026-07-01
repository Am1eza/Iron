'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './Marquee.module.css';

/**
 * Robust, seamless marquee. Items are rendered twice (the back copy is
 * aria-hidden) so the loop never re-centers. A single requestAnimationFrame loop
 * eases `pos` toward `goal` and writes `track.style.transform` — a string
 * assignment that can't throw. Wraps by the measured half-width (self-heals if not
 * laid out yet, so it always shows every item). «prev/next» bump `goal` by one
 * item for a smooth nudge (no jump, no Web-Animations seeks). Pauses on
 * hover/focus and when the tab is hidden. Under `prefers-reduced-motion` the JS
 * loop is off and the strip becomes a swipeable, static row.
 *
 * The DOM (both copies) is identical on server and client — only the JS loop is
 * gated on reduced-motion — so there is no hydration divergence.
 */
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
  const n = Math.max(1, items.length);

  useEffect(() => {
    if (reduced) return;
    const track = trackRef.current;
    if (!track) return;

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const track2 = trackRef.current;
      if (!track2) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; // clamp big gaps
      last = now;
      const half = track2.scrollWidth / 2;
      if (half > 0) {
        if (!paused.current && !document.hidden) goal.current += speed * dt;
        // ease toward the goal (smooths both auto drift and button nudges)
        pos.current += (goal.current - pos.current) * Math.min(1, dt * 12);
        // seamless wrap: subtract one copy width from both once we pass it
        if (pos.current >= half && goal.current >= half) {
          pos.current -= half;
          goal.current -= half;
        }
        track2.style.transform = `translateX(${-pos.current}px)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, speed, n]);

  const nudge = (dir: 1 | -1) => {
    if (reduced) {
      const vp = viewportRef.current;
      vp?.scrollBy({ left: dir * Math.round((vp.clientWidth || 240) * 0.6), behavior: 'smooth' });
      return;
    }
    const track = trackRef.current;
    const half = track ? track.scrollWidth / 2 : 0;
    const item = half > 0 ? half / n : 160;
    goal.current += dir * item;
  };

  const renderItems = (muted: boolean) =>
    items.map((node, i) => (
      <li
        key={(muted ? 'b' : 'a') + i}
        className={styles.item}
        aria-hidden={muted ? true : undefined}
      >
        {node}
      </li>
    ));

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.nav} aria-label="قبلی" onClick={() => nudge(-1)}>
        <ChevronEndIcon size={22} className="icon--rtl" />
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
        <ul ref={trackRef} className={styles.track}>
          {renderItems(false)}
          {renderItems(true)}
        </ul>
      </div>

      <button type="button" className={styles.nav} aria-label="بعدی" onClick={() => nudge(1)}>
        <ChevronStartIcon size={22} className="icon--rtl" />
      </button>
    </div>
  );
}
