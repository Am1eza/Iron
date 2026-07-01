'use client';
import { useRouter, usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/lib/stores/auth';

/**
 * Client-side auth gate for request CTAs: run the action if the user is signed
 * in, otherwise send them to the OTP login with a return path (default: the
 * current page). Requests always belong to a profile — no anonymous forms.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);

  const requireAuth = (action: () => void, next?: string) => {
    if (status === 'authenticated') {
      action();
    } else {
      router.push(routes.login(next ?? pathname));
    }
  };

  return { requireAuth, isAuthenticated: status === 'authenticated' };
}
