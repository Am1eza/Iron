'use client';
import { useEffect } from 'react';

type Guard = () => Promise<boolean>;

/**
 * W23 review fix: the admin Command Palette (Cmd/Ctrl-K) navigates via
 * `router.push()` from a button click, not an `<a>` — invisible to both
 * `beforeunload` and a same-page click-interceptor. A page with its own
 * unsaved-work confirm (today: the pricing grid) registers a guard here
 * while dirty; anything that navigates outside a normal link click
 * (CommandPalette's `go()`) awaits `checkUnsavedGuard()` first. Only one
 * page's guard can be active at a time — acceptable today since exactly one
 * page (pricing) uses it; last-registered wins if that ever changes.
 */
let activeGuard: Guard | null = null;

export function useUnsavedGuard(active: boolean, guard: Guard) {
  useEffect(() => {
    if (!active) return;
    activeGuard = guard;
    return () => {
      if (activeGuard === guard) activeGuard = null;
    };
  }, [active, guard]);
}

/** Resolves true if navigation may proceed — no guard registered, or the
 *  registered guard's own confirm resolved true. */
export async function checkUnsavedGuard(): Promise<boolean> {
  if (!activeGuard) return true;
  return activeGuard();
}
