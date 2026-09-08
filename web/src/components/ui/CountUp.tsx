'use client';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useIntersectionObserver } from '@/lib/hooks/useIntersectionObserver';
import { localizeDigits } from '@/lib/utils/format';

/**
 * Shows its initial value immediately, then animates updates after first visibility.
 * Static under reduced motion; unchanged values schedule no animation frames.
 * `locale` defaults to 'fa' (Persian digits) so every existing caller is
 * unaffected; a caller in a non-fa locale passes its own to get Latin digits.
 */
export function CountUp({
  value,
  duration = 1.1,
  locale = 'fa',
}: {
  value: number;
  duration?: number;
  locale?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const { ref, isIntersecting: seen } = useIntersectionObserver<HTMLSpanElement>({
    rootMargin: '0px 0px -10% 0px',
    freezeOnceVisible: true,
    enabled: !reduced,
  });

  useEffect(() => {
    if (reduced || !seen || duration <= 0 || !Number.isFinite(duration)) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      fromRef.current = Math.round(from + (value - from) * eased);
      setDisplay(fromRef.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced, seen]);

  // The animating digits are presentation-only (a `requestAnimationFrame` tick
  // would spam AT with every intermediate value if ever nested in a live
  // region) — hide them and expose the settled `value` once, via a
  // visually-hidden sibling, so this primitive is safe wherever it's used.
  return (
    <span ref={ref}>
      <span aria-hidden="true">{localizeDigits(display.toLocaleString('en-US'), locale)}</span>
      <span className="visually-hidden">{localizeDigits(value.toLocaleString('en-US'), locale)}</span>
    </span>
  );
}
