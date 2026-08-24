'use client';
import { useEffect, useRef } from 'react';
import styles from './ReadingProgress.module.css';

/**
 * A thin fixed bar across the very top of the viewport, filling with scroll
 * progress down the page. Purely a visual aid (the page's own scrollbar
 * already conveys this) — `aria-hidden`, nothing here is announced.
 *
 * Writes `inline-size` on a ref directly on scroll rather than through React
 * state: a state-driven re-render on every scroll tick would be the kind of
 * thing that shows up in a profiler on a long article, for a bar nobody
 * looks away from the content to read closely.
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      if (barRef.current) barRef.current.style.inlineSize = `${pct * 100}%`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className={styles.track} aria-hidden="true">
      <div ref={barRef} className={styles.bar} />
    </div>
  );
}
