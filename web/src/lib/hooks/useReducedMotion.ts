'use client';
import { useMediaQuery } from './useMediaQuery';
import { useUiStore } from '@/lib/stores/ui';

/**
 * Reduced-motion = system preference, optionally overridden by the user (uiStore).
 * The single source for gating animations (motion-design.md §8).
 */
export function useReducedMotion(): boolean {
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  const override = useUiStore((s) => s.reducedMotionOverride);
  return override ?? system;
}
