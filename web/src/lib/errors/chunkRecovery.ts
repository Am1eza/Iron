'use client';
/**
 * Shared recovery logic for the one failure class that actually reaches this
 * app's error boundaries in production: a JS chunk that failed to download on
 * a weak connection.
 *
 * Extracted verbatim from `app/global-error.tsx` (PRs #193/#194), which
 * carries the full root-cause write-up and the log evidence behind it. The
 * short version, because every consumer of this module depends on it:
 *
 *   Next's `reset()` only re-renders the already-mounted React tree. Webpack
 *   marks a chunk id that failed to load as permanently failed for the life
 *   of the page, so re-rendering re-throws the SAME error — observed three
 *   times in a row, ~2s apart, in the original report. Only a real navigation
 *   (`location.reload()`) boots a fresh JS runtime and re-fetches the chunk
 *   manifest. `isReloadableError` is what routes that class to a reload.
 *
 * `useChunkRecovery` wraps the three behaviours built on top of that finding —
 * a single guarded silent auto-retry, a retry the moment connectivity returns,
 * and the disabled/label state while either is pending — so the four boundaries
 * that want them don't reimplement (and drift on) the same logic.
 */
import { useEffect, useState } from 'react';

// Historical name — this shipped as global-error's key and is kept byte-identical
// so an in-flight session that already auto-reloaded before a deploy is still
// guarded after it. The guard itself is deliberately tab-wide, not per-boundary:
// a reload is a page-level action, so "this tab already auto-reloaded a moment
// ago" is the right thing to remember, whichever boundary fired.
const AUTO_RELOAD_KEY = 'ahantime:global-error:auto-reload-at';

// A fresh failure more than this long after the last auto-reload gets its
// own attempt; within it, we assume it's the same incident looping and stop
// reloading automatically — an outage on the server side isn't something a
// reload fixes, and reloading forever would just thrash the connection.
const AUTO_RELOAD_WINDOW_MS = 20_000;

/** How long to wait before the silent auto-retry — long enough that a reload
 *  which immediately fails again doesn't read as a flash, short enough to beat
 *  the user reaching for the button. */
const AUTO_RELOAD_DELAY_MS = 1200;

export function isReloadableError(error: Error): boolean {
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

export type ChunkRecovery = {
  /** True when the error is the reload-recoverable class described above. */
  reloadable: boolean;
  /** `navigator.onLine`, kept live. Starts optimistic (SSR has no navigator). */
  isOnline: boolean;
  /** A silent auto-reload is scheduled and about to fire. */
  autoRetrying: boolean;
  /** The retry control should be disabled — offline, or an auto-retry is pending. */
  disabled: boolean;
  /** Persian label for the retry control, reflecting the state above. */
  retryLabel: string;
  /** Persian live-region text; empty string when there is nothing to announce. */
  statusText: string;
  /** Reload for the reloadable class, `reset()` for everything else. */
  retry: () => void;
};

/**
 * @param error the boundary's error
 * @param reset the boundary's `reset` — used only for NON-reloadable errors,
 *              where re-rendering genuinely can recover.
 */
export function useChunkRecovery(error: Error, reset: () => void): ChunkRecovery {
  const reloadable = isReloadableError(error);
  const [isOnline, setIsOnline] = useState(true);
  const [autoRetrying, setAutoRetrying] = useState(false);

  // Offline state drives the disabled/label state below, and — the specific
  // gap in the original report — retries on its own the instant connectivity
  // returns, instead of leaving the user to notice and tap the button.
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
  // immediately; the `online` listener above already covers that case.
  useEffect(() => {
    if (!reloadable || !navigator.onLine) return;
    if (Date.now() - readAutoReloadGuard() < AUTO_RELOAD_WINDOW_MS) return;
    setAutoRetrying(true);
    const t = setTimeout(() => {
      writeAutoReloadGuard();
      window.location.reload();
    }, AUTO_RELOAD_DELAY_MS);
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

  return {
    reloadable,
    isOnline,
    autoRetrying,
    disabled,
    retryLabel,
    statusText,
    retry: () => (reloadable ? window.location.reload() : reset()),
  };
}
