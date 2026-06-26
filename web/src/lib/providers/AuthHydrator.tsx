'use client';
import { useEffect } from 'react';
import { useAuthStore, type SessionUser } from '@/lib/stores/auth';

/**
 * Seeds the auth store with the server-resolved user (from the session cookie),
 * so the first client paint already knows who's logged in — no client fetch flash.
 * Mount in a server layout once auth ships: <AuthHydrator initialUser={user} />.
 */
export function AuthHydrator({ initialUser }: { initialUser: SessionUser | null }) {
  const setUser = useAuthStore((s) => s.setUser);
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser, setUser]);
  return null;
}
