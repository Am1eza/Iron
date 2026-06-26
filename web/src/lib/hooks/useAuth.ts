'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth';
import { api } from '@/lib/api';
import { can, canAccessAdmin } from '@/lib/auth/roles';
import type { Permission } from '@/lib/auth/types';

/**
 * Client auth facade — current user/status + actions (logout, silent refresh) and
 * permission helpers. The session itself lives in httpOnly cookies; this only
 * mirrors the public user for UI decisions.
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  return {
    user,
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    can: (permission: Permission) => can(user?.role, permission),
    canAccessAdmin: () => canAccessAdmin(user?.role),

    async logout(redirectTo = '/') {
      try {
        await api.auth.logout();
      } finally {
        setUser(null);
        router.push(redirectTo);
        router.refresh();
      }
    },

    /** Silent refresh — rotate tokens; returns whether a session survived. */
    async refresh(): Promise<boolean> {
      try {
        const { user: u } = await api.auth.refresh();
        setUser(u);
        return true;
      } catch {
        setUser(null);
        return false;
      }
    },
  };
}
