'use client';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { toPersianDigits } from '@/lib/utils/format';

/**
 * Count-up number — animates to its value the first time it scrolls into view
 * (the «آهن‌تایم» live feel), then on each `value` change. Grouped Persian digits.
 * Static under reduced-motion; the rAF only runs while visible (no offscreen work).
 */
export function CountUp({ value, duration = 1.1 }: { value: number; duration?: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const [seen, setSeen] = useState(false);

  // Animate only once the number is on screen.
  useEffect(() => {
    if (reduced || seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, seen]);

  useEffect(() => {
    if (reduced || !seen) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced, seen]);

  return <span ref={ref}>{toPersianDigits(display.toLocaleString('en-US'))}</span>;
}
