'use client';
import { useCallback, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

/**
 * F11 · The Spark — the signature amber pulse fired at the point of value
 * (fresh-price publish, primary-action press, AI wake). Reduced-motion → no-op.
 *
 * Usage:
 *   const { ref, fire } = useSpark<HTMLButtonElement>();
 *   <button ref={ref} onClick={fire}>…</button>
 * The pulse itself is the global `.spark` utility (tokens.css).
 */
export function useSpark<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  const fire = useCallback(() => {
    const el = ref.current;
    if (!el || reduced) return;
    el.classList.remove('spark');
    void el.offsetWidth; // reflow → replay the one-shot animation
    el.classList.add('spark');
  }, [reduced]);

  return { ref, fire };
}
