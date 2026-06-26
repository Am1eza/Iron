'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import type { Permission } from '@/lib/auth/types';

/**
 * Permission-gated UI (item 58). Renders children only if the current user holds
 * the permission. This is a UX affordance — the server still enforces access on
 * every protected route/handler (guards.ts / route checks).
 */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(permission) ? children : fallback}</>;
}
