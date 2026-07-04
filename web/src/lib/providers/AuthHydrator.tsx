'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth';
import { api } from '@/lib/api';
import { useRequestsSync } from '@/lib/hooks/useRequestsSync';

/** Access-token lifetime (15 min) → refresh comfortably before it expires. */
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

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
    api.auth
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setAuthenticated(true);
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
        const { user } = await api.auth.refresh();
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
