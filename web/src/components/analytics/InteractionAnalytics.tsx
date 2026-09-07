'use client';
import { useEffect } from 'react';
import { trackGoal } from '@/lib/analytics/track';

/**
 * Captures declarative navigation events plus phone/WhatsApp hand-offs. The
 * site already annotated links with data-event; without this delegated
 * listener those attributes were inert and the top of the funnel invisible.
 */
export function InteractionAnalytics() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('a,button') : null;
      if (!target) return;
      const declared = target.dataset.event;
      if (declared) trackGoal('navigation', declared, window.location.pathname);
      if (target instanceof HTMLAnchorElement) {
        if (target.href.startsWith('tel:')) trackGoal('contact', 'phone-click', window.location.pathname);
        if (/wa\.me|whatsapp\.com/.test(target.href))
          trackGoal('contact', 'whatsapp-click', window.location.pathname);
        try {
          if (new URL(target.href).pathname === '/login')
            trackGoal('funnel', 'auth_gate_continue', window.location.pathname);
        } catch {
          // Malformed/non-http hrefs are irrelevant to this funnel event.
        }
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
