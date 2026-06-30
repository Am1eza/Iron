'use client';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ChevronStartIcon, ChevronEndIcon } from '@/components/primitives/icons';
import styles from './Marquee.module.css';

/**
 * Seamless, GPU-accelerated marquee. The items are rendered twice (the back copy
 * is aria-hidden) and the track is translated 0 → -50% via the Web Animations API
 * — because the back half duplicates the front, the loop never re-centers and
 * never "teleports". Pauses on hover/focus, when offscreen, and when the tab is
 * hidden. «prev/next» smoothly tween the playhead by one item (no jump). Under
 * `prefers-reduced-motion` it becomes a static, swipeable, snap row.
 */
export function Marquee({
  items,
  ariaLabel,
  speed = 44,
}: {
  items: ReactNode[];
  ariaLabel?: string;
  speed?: number; // px per second
}) {
  const reduced = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const animRef = useRef<Animation | null>(null);
  const hovered = useRef(false);
  const visible = useRef(true);
  const n = items.length;

  // Resume only when it should actually be running.
  const maybePlay = useCallback(() => {
    const a = animRef.current;
    if (a && !hovered.current && visible.current && !document.hidden) a.play();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    let anim: Animation | null = null;
    const build = () => {
      const half = track.scrollWidth / 2;
      if (half <= 0) return;
      const duration = (half / speed) * 1000;
      anim?.cancel();
      anim = track.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
        { duration, iterations: Infinity, easing: 'linear' },
      );
      animRef.current = anim;
      maybePlay();
    };
    build();

    const ro = new ResizeObserver(build);
    ro.observe(track);

    const io = new IntersectionObserver(
      (entries) => {
        visible.current = entries.some((e) => e.isIntersecting);
        if (visible.current) maybePlay();
        else animRef.current?.pause();
      },
      { threshold: 0 },
    );
    io.observe(viewport);

    const onVis = () => (document.hidden ? animRef.current?.pause() : maybePlay());
    document.addEventListener('visibilitychange', onVis);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      anim?.cancel();
      animRef.current = null;
    };
  }, [reduced, speed, n, maybePlay]);

  const pause = () => {
    hovered.current = true;
    animRef.current?.pause();
  };
  const resume = () => {
    hovered.current = false;
    maybePlay();
  };

  // Smoothly tween the playhead by one item (dir: 1 = next, -1 = prev).
  const nudge = (dir: 1 | -1) => {
    if (reduced) {
      const vp = viewportRef.current;
      vp?.scrollBy({ left: dir * Math.round(vp.clientWidth * 0.6), behavior: 'smooth' });
      return;
    }
    const a = animRef.current;
    const dur = (a?.effect?.getComputedTiming().duration as number) ?? 0;
    if (!a || !dur) return;
    a.pause();
    const from = (a.currentTime as number) ?? 0;
    const to = from + dir * (dur / Math.max(1, n));
    const t0 = performance.now();
    const T = 420;
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / T);
      a.currentTime = from + (to - from) * ease(p);
      if (p < 1) requestAnimationFrame(step);
      else maybePlay();
    };
    requestAnimationFrame(step);
  };

  const renderItems = (muted: boolean) =>
    items.map((node, i) => (
      <li key={(muted ? 'b' : 'a') + i} className={styles.item} aria-hidden={muted ? true : undefined}>
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
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={resume}
        role="group"
        aria-label={ariaLabel}
      >
        <ul ref={trackRef} className={styles.track}>
          {renderItems(false)}
          {!reduced && renderItems(true)}
        </ul>
      </div>

      <button type="button" className={styles.nav} aria-label="بعدی" onClick={() => nudge(1)}>
        <ChevronStartIcon size={22} className="icon--rtl" />
      </button>
    </div>
  );
}
