'use client';
import { useEffect } from 'react';
import { useAuthStore, type SessionUser } from '@/lib/stores/auth';
import { api } from '@/lib/api';
import { useRequestsSync } from '@/lib/hooks/useRequestsSync';

/** Access-token lifetime (15 min) → refresh comfortably before it expires. */
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

/**
 * Seeds the auth store with the server-resolved user (from the access cookie) so
 * the first client paint already knows who's signed in — no fetch flash. While
 * authenticated, it silently rotates the session (refresh token) on an interval
 * so long sessions never expire mid-use.
 */
export function AuthHydrator({ initialUser }: { initialUser: SessionUser | null }) {
  const setUser = useAuthStore((s) => s.setUser);
  // Live mode: mirror the server-side requests inbox into the local store.
  useRequestsSync();

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser, setUser]);

  useEffect(() => {
    if (!initialUser) return;

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
  }, [initialUser, setUser]);

  return null;
}
