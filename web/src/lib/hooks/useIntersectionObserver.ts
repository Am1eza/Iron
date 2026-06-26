'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Generic IntersectionObserver hook. Returns a ref to attach to a sentinel and
 * whether it's currently intersecting. `freezeOnceVisible` disconnects after the
 * first intersection (useful for reveal/lazy-mount).
 */
export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>(options?: {
  rootMargin?: string;
  threshold?: number | number[];
  freezeOnceVisible?: boolean;
  enabled?: boolean;
}) {
  const { rootMargin = '0px', threshold = 0, freezeOnceVisible = false, enabled = true } =
    options ?? {};
  const ref = useRef<T | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const frozen = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || frozen.current) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting && freezeOnceVisible) {
          frozen.current = true;
          io.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, threshold, freezeOnceVisible, enabled]);

  return { ref, isIntersecting };
}
