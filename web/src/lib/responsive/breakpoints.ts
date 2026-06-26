/**
 * Breakpoint tokens — the single source for responsive logic in JS, matching the
 * CSS breakpoints in the design system (responsive-design.md). Mobile-first.
 */
export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  wide: 1440,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** `min-width` media query for a breakpoint (e.g. `(min-width: 768px)`). */
export function above(bp: Breakpoint): string {
  return `(min-width: ${BREAKPOINTS[bp]}px)`;
}

/** `max-width` media query just below a breakpoint (e.g. `(max-width: 767.98px)`). */
export function below(bp: Breakpoint): string {
  return `(max-width: ${BREAKPOINTS[bp] - 0.02}px)`;
}
