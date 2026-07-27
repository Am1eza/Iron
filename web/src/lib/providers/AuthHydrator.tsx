'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth';
// Deep import, NOT the `@/lib/api` barrel: the barrel re-exports the market
// and catalog resources too, which pull the zod validation schemas into this
// root-layout component — i.e. onto every page's critical path — for an
// endpoint this file never calls.
import { authApi } from '@/lib/api/resources/auth';
import { useRequestsSync } from '@/lib/hooks/useRequestsSync';

/**
 * Access-token lifetime is 4h (CONSTANTS.ACCESS_TTL_SECONDS) → rotate at 3h,
 * comfortably ahead of expiry. It used to fire every 12 minutes against a
 * 15-minute token, which rewrote the refresh-token row ~5×/hour per open tab
 * for no benefit; an expired cookie is now recovered by /api/auth/silent on
 * the next navigation anyway, so this interval is belt-and-braces for a tab
 * left open, not the mechanism sessions depend on.
 */
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

/**
 * Resolves the signed-in user from the access cookie on the client (`GET /api/me`)
 * instead of a server-side session read in the root layout — reading the session
 * cookie there (`cookies()`) forces every route in the app into per-request
 * dynamic rendering, defeating ISR site-wide (the app is otherwise ~100%
 * anonymous, cacheable traffic). The store already starts in a `loading` status
 * so consumers can render a neutral shell until this resolves. While
 * authenticated, it silently rotates the session (refresh token) on an interval
 * so long sessions never expire mid-use.
 */
export function AuthHydrator() {
  const setUser = useAuthStore((s) => s.setUser);
  const [authenticated, setAuthenticated] = useState(false);
  // Live mode: mirror the server-side requests inbox into the local store.
  useRequestsSync();

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user ?? null);
        // Only an actual session starts the rotation timer — `user: null` is
        // the ordinary anonymous answer now (200, not 401), so it must not be
        // mistaken for "signed in".
        setAuthenticated(Boolean(user));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  useEffect(() => {
    if (!authenticated) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const { user } = await authApi.refresh();
        if (!cancelled) setUser(user);
      } catch {
        if (!cancelled) setUser(null);
      }
    };

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authenticated, setUser]);

  return null;
}
