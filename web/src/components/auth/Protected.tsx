'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { routes } from '@/lib/routes';
import { EmptyState, emptyPresets } from '@/components/ui';

/**
 * Client-side guard for interactive sections (item 60). Server pages should prefer
 * `requireUser()`; this covers client-only views. Redirects guests to OTP login
 * with a return path once the session status is known.
 */
export function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(routes.login(pathname));
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  if (isAuthenticated) return <>{children}</>;
  if (isLoading) return null;
  return <EmptyState size="full" {...emptyPresets.authRequired(pathname)} />;
}
