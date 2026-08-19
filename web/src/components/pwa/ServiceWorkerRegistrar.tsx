'use client';
import { useEffect } from 'react';

/**
 * Registers `public/sw.js` — the immutable-static-asset cache. Read that
 * file's header before changing anything here; the safety rules live there.
 *
 * Renders nothing. Everything is behind a feature check, so on a browser
 * without service workers, or in a non-secure context (`serviceWorker` is
 * simply absent off https/localhost), this is a no-op rather than a throw.
 *
 * Deliberately NOT registered on the admin panel. The worker's own fetch
 * handler already ignores everything outside its allowlist, so this is the
 * second of two independent guarantees rather than the only one — but an
 * operator's session is exactly where an unexpected cached response would be
 * most expensive, and the panel gets no benefit from the cache anyway (it is
 * a repeat-visit tool on a good connection, not a cold first paint on 3G).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const { hostname, pathname } = window.location;
    if (hostname.startsWith('panel.') || pathname.startsWith('/admin')) return;

    // Registration rejects for ordinary, non-actionable reasons (an
    // unreachable sw.js under a basePath in the static-export preview build,
    // a browser with service workers disabled by policy, an insecure origin).
    // None of those should surface as an unhandled rejection in the console
    // of an otherwise working page.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };

    // Deferred to `load`: registering fires its own network request for
    // sw.js, and on the weak connections this whole feature exists for that
    // must not compete with the page's own critical resources. The first
    // visit gains nothing from the cache anyway — it is the visit that
    // fills it.
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
