'use client';
import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import styles from './Reveal.module.css';

/**
 * One-shot in-view reveal. Wraps children in a div that starts slightly shifted/
 * transparent and transitions in the first time it enters the viewport
 * (IntersectionObserver → data-in; CSS does the rest — transform/opacity only).
 * `index` staggers siblings via a CSS delay. Renders visible immediately under
 * reduced-motion or when IO is unavailable. Zero dependencies.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.setAttribute('data-in', '');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={[styles.reveal, className].filter(Boolean).join(' ')}
      data-in={reduced ? '' : undefined}
      style={{ '--reveal-i': index } as CSSProperties}
    >
      {children}
    </div>
  );
}
