/**
 * Web Storage that cannot take the page down.
 *
 * Three separate things throw where naive code assumes they can't:
 *  1. READING `window.localStorage` at all throws `SecurityError` when the
 *     browser blocks storage for the origin — Safari's "Prevent cross-site
 *     tracking" in an embedded/third-party context, Chrome with all cookies
 *     blocked, Firefox's "never remember history". The property access itself
 *     throws, before any get/set.
 *  2. `setItem` throws `QuotaExceededError` in Safari private browsing (the
 *     quota there is effectively zero) and on any full-quota origin.
 *  3. The value may be present but corrupt.
 *
 * Any of those thrown at module scope or inside a render/effect is a white
 * screen, not a degraded feature — persistence is best-effort by nature and
 * nothing here is worth a blank page for. Every read returns null and every
 * write is a no-op when storage is unavailable; the in-memory state carries
 * on for the session.
 *
 * Shaped as a `Storage` so it drops straight into zustand's
 * `createJSONStorage(() => safeLocalStorage)`.
 */

type Backing = 'localStorage' | 'sessionStorage';

/** Access the underlying Storage, or null if the browser refuses. Result is
 *  NOT cached: permission can change within a session (e.g. the user grants
 *  storage access), and a cached null would keep the feature dead. */
function backing(kind: Backing): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function make(kind: Backing) {
  return {
    getItem(key: string): string | null {
      try {
        return backing(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        backing(kind)?.setItem(key, value);
      } catch {
        /* quota / private mode — this session stays in memory only */
      }
    },
    removeItem(key: string): void {
      try {
        backing(kind)?.removeItem(key);
      } catch {
        /* noop */
      }
    },
    /** True when writes actually persist. Use to decide whether to offer a
     *  "we remembered this" affordance, not to guard the calls above. */
    available(): boolean {
      const s = backing(kind);
      if (!s) return false;
      try {
        const probe = '__ahantime_probe__';
        s.setItem(probe, '1');
        s.removeItem(probe);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const safeLocalStorage = make('localStorage');
export const safeSessionStorage = make('sessionStorage');

/** Read + JSON.parse in one guarded step. Returns `fallback` on missing,
 *  unavailable or corrupt data — a half-written blob is the same class of
 *  problem as no storage at all. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = safeLocalStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    safeLocalStorage.removeItem(key);
    return fallback;
  }
}

/** JSON.stringify + write in one guarded step. Silently skips when the value
 *  cannot be serialised (cyclic structures) rather than throwing at the call
 *  site. */
export function writeJson(key: string, value: unknown): void {
  try {
    safeLocalStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}
