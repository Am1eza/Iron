/**
 * Server guards for protected pages/layouts (use in Server Components).
 * - requireUser: redirect guests to OTP login, preserving `next`.
 * - requirePermission: 404 for unauthorized staff routes (hide, don't reveal).
 * Route handlers use the lighter `getSession()` + manual 401/403 instead.
 */
import { redirect, notFound } from 'next/navigation';
import { routes } from '@/lib/routes';
import { getSession } from './session';
import { can } from './roles';
import type { AuthUser, Permission } from './types';

/** Require any authenticated user; otherwise redirect to login with a return path. */
export async function requireUser(nextPath?: string): Promise<AuthUser> {
  const user = await getSession();
  if (!user) redirect(routes.login(nextPath));
  return user;
}

/** Require a permission; guests → login, authenticated-but-unauthorized → 404. */
export async function requirePermission(
  permission: Permission,
  nextPath?: string,
): Promise<AuthUser> {
  const user = await getSession();
  if (!user) redirect(routes.login(nextPath));
  if (!can(user.role, permission)) notFound();
  return user;
}
