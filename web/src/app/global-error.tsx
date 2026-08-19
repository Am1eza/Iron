'use client';
/**
 * Global error — catches failures in the ROOT layout itself (rare).
 * Must define its own <html>/<body> (Next.js requirement: this fully
 * replaces the root layout when active, so nothing from layout.tsx —
 * including <head> metadata/viewport — carries over automatically).
 * Styles, the icon, and the font stack are therefore self-contained with
 * literal brand colors and inline SVG: nothing here may depend on another
 * chunk, since a failed chunk is the most common reason this boundary fires
 * at all (see isReloadableError below).
 *
 * Root cause data (glitchtip + container logs, 2026-08-19): every real hit
 * on this boundary was `ChunkLoadError` from a weak connection failing to
 * fetch a JS chunk, and clicking "تلاش دوباره" three times in a row re-threw
 * the SAME error every time, ~2s apart. That's not a broken click handler —
 * Next's `reset()` only re-renders the already-mounted React tree, but
 * webpack's module registry marks a failed chunk id permanently failed for
 * the life of the page; no re-render can undo that. The only real fix is a
 * full navigation, which boots a fresh JS runtime and re-fetches the current
 * chunk manifest. `isReloadableError` routes exactly that failure class to
 * `location.reload()` instead of `reset()`, auto-retries it once on its own,
 * and retries again the moment the browser regains connectivity — the three
 * things a person on a bad connection would otherwise have to notice,
 * diagnose, and do by hand.
 */
import { useEffect, useRef, useState } from 'react';
import { reportError } from '@/lib/errors/report';

const AUTO_RELOAD_KEY = 'ahantime:global-error:auto-reload-at';
// A fresh failure more than this long after the last auto-reload gets its
// own attempt; within it, we assume it's the same incident looping and stop
// reloading automatically — an outage on the server side isn't something a
// reload fixes, and reloading forever would just thrash the connection.
const AUTO_RELOAD_WINDOW_MS = 20_000;

function isReloadableError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') return true;
  // Browsers phrase a failed fetch differently (Chrome: "Failed to fetch",
  // Safari: "Load failed", Firefox: "NetworkError when attempting to fetch
  // resource") — matched loosely since only the underlying cause is shared.
  return /loading chunk .* failed|failed to fetch|load failed|networkerror/i.test(error.message);
}

/** sessionStorage can throw in locked-down private-browsing modes — an error
 *  page that itself throws would be the worst possible outcome here. */
function readAutoReloadGuard(): number {
  try {
    return Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function writeAutoReloadGuard(): void {
  try {
    sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
  } catch {
    // no-op — see readAutoReloadGuard
  }
}

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const reloadable = isReloadableError(error);
  const [isOnline, setIsOnline] = useState(true);
  const [autoRetrying, setAutoRetrying] = useState(false);

  useEffect(() => {
    reportError(error, { source: 'global-error' });
  }, [error]);

  // Move focus to the heading so AT users are told about the failure
  // immediately, same as role="alert" announces it (accessibility.md §4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Offline state drives the button's disabled/label state below, and —
  // the specific gap in the original report — retries on its own the
  // instant connectivity returns, instead of leaving the user to notice and
  // tap the button themselves.
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => {
      setIsOnline(true);
      if (reloadable) window.location.reload();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [reloadable]);

  // One silent, guarded auto-retry for the failure class actually observed
  // in production — most weak-connection chunk failures resolve within a
  // second or two, so this quietly saves that user a manual tap. Skipped
  // while offline: reloading with no connection would just fail again
  // immediately: the `online` listener above already covers that case.
  useEffect(() => {
    if (!reloadable || !navigator.onLine) return;
    if (Date.now() - readAutoReloadGuard() < AUTO_RELOAD_WINDOW_MS) return;
    setAutoRetrying(true);
    const t = setTimeout(() => {
      writeAutoReloadGuard();
      window.location.reload();
    }, 1200);
    return () => clearTimeout(t);
  }, [reloadable]);

  const disabled = reloadable && (!isOnline || autoRetrying);
  const retryLabel =
    reloadable && !isOnline
      ? 'در انتظار اتصال اینترنت…'
      : autoRetrying
        ? 'در حال تلاش خودکار…'
        : 'تلاش دوباره';
  const statusText =
    reloadable && !isOnline
      ? 'اتصال اینترنت قطع است — به‌محض وصل‌شدن دوباره تلاش می‌کنیم.'
      : autoRetrying
        ? 'در حال تلاش خودکار برای اتصال…'
        : '';

  return (
    <html lang="fa" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>مشکلی پیش اومد | آهن‌تایم</title>
      </head>
      <body
        className="ahn-ge"
        style={{
          margin: 0,
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg)',
          color: 'var(--heading)',
          fontFamily: 'Tahoma, system-ui, sans-serif',
          padding: 24,
        }}
      >
        <style>{`
          .ahn-ge{--bg:#F4F7FA;--heading:#171C22;--body:#64707E;--badge:#E3F3F1;--accent:#0A7F77;--accent-hover:#096B64;--accent-contrast:#FFFFFF;--border:#E3E8EE;--ring:#0A7F77}
          @media (prefers-color-scheme: dark){
            .ahn-ge{--bg:#10151A;--heading:#F4F7FA;--body:#9AA5B1;--badge:rgba(18,169,158,.16);--accent:#12A99E;--accent-hover:#17BCAF;--accent-contrast:#08211F;--border:#262E36;--ring:#3FD6C8}
          }
          .ahn-ge__retry{cursor:pointer;background:var(--accent);color:var(--accent-contrast);transition:background-color .15s ease}
          .ahn-ge__retry:not(:disabled):hover{background:var(--accent-hover)}
          .ahn-ge__retry:disabled{opacity:.55;cursor:not-allowed}
          .ahn-ge__retry:focus-visible,.ahn-ge__home:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
          @media (prefers-reduced-motion: reduce){.ahn-ge__retry{transition:none}}
        `}</style>
        <div role="alert" style={{ maxWidth: 400, width: '100%' }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'var(--badge)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--accent)',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12" y2="16.51" />
            </svg>
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            style={{ color: 'var(--heading)', fontSize: 26, margin: 0, textAlign: 'center' }}
          >
            مشکلی پیش اومد
          </h1>
          <p
            style={{
              color: 'var(--body)',
              marginTop: 10,
              marginBottom: 0,
              textAlign: 'center',
              lineHeight: 1.8,
            }}
          >
            از طرف ما بود. چند لحظه دیگر دوباره امتحان کنید.
          </p>
          <p
            aria-live="polite"
            style={{
              minHeight: 20,
              color: 'var(--body)',
              fontSize: 13,
              marginTop: 10,
              marginBottom: 0,
              textAlign: 'center',
            }}
          >
            {statusText}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              marginTop: 24,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="ahn-ge__retry"
              onClick={() => (reloadable ? window.location.reload() : reset())}
              disabled={disabled}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '12px 28px',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {retryLabel}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                next/link's <Link> reads router context from the App Router
                tree that this file's own comment already establishes may not
                exist here — global-error replaces the ROOT layout entirely,
                so there is no guarantee a RouterContext provider is mounted
                above this component. A plain <a> forces a real navigation,
                which is also exactly what recovers a ChunkLoadError (see the
                file header) — Link's client-side transition wouldn't. */}
            <a
              href="/"
              className="ahn-ge__home"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '12px 28px',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--heading)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              بازگشت به صفحه اصلی
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
