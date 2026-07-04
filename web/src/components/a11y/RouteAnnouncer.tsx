'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAnnounce } from '@/lib/hooks/useAnnounce';

/**
 * WCAG 2.2 §2.4.3 / §4.1.3 — Next.js App Router client-side navigation never
 * resets focus/scroll the way a full page load does, so on every route change
 * this moves focus to `<main id="main" tabIndex={-1}>` and announces the new
 * page title via the polite live region (design/accessibility.md §2.3).
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const announce = useAnnounce();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Wait a tick so `document.title` reflects the new route's metadata.
    const id = requestAnimationFrame(() => {
      document.getElementById('main')?.focus();
      announce(document.title);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, announce]);

  return null;
}
