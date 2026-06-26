'use client';
import { useMediaQuery } from './useMediaQuery';
import { above, type Breakpoint } from '@/lib/responsive/breakpoints';

/** True when the viewport is at least `bp` wide (SSR-safe: false until mounted). */
export function useBreakpoint(bp: Breakpoint): boolean {
  return useMediaQuery(above(bp));
}

/** Convenience flags for the three primary lanes (mobile / tablet / desktop). */
export function useDevice() {
  const md = useMediaQuery(above('md'));
  const lg = useMediaQuery(above('lg'));
  return {
    isMobile: !md,
    isTablet: md && !lg,
    isDesktop: lg,
  };
}
