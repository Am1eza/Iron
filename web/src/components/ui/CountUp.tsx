'use client';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { toPersianDigits } from '@/lib/utils/format';

/**
 * Count-up number — animates to its value on mount (the «آهن‌تایم» live feel).
 * Grouped Persian digits. Static under reduced-motion. Re-animates when `value`
 * changes (e.g. a fresh price), so updates read as alive, not as a hard swap.
 */
export function CountUp({ value, duration = 1.1 }: { value: number; duration?: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
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
  }, [value, duration, reduced]);

  return <>{toPersianDigits(display.toLocaleString('en-US'))}</>;
}
