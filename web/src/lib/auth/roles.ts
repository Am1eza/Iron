/**
 * Role & permission model (RBAC) — navigation.md §21. Roles map to permission
 * sets; the UI and route guards check `can(role, permission)`. Staff roles are
 * hidden (not just disabled) for unauthorized users; direct access → 403.
 */
import type { Permission, Role } from './types';

export const ROLES: Role[] = ['customer', 'operator', 'sales', 'content', 'catalog', 'admin'];

export const ROLE_LABEL: Record<Role, string> = {
  customer: 'مشتری',
  operator: 'اپراتور قیمت‌گذاری',
  sales: 'کارشناس فروش',
  content: 'سردبیر محتوا',
  catalog: 'مدیر کاتالوگ',
  admin: 'مدیر سیستم',
};

/** Staff roles can reach the admin area; customers cannot. */
export const STAFF_ROLES: Role[] = ['operator', 'sales', 'content', 'catalog', 'admin'];
export const isStaff = (role: Role) => STAFF_ROLES.includes(role);

const ADMIN_ALL: Permission[] = [
  'pricing:write',
  'catalog:read',
  'catalog:write',
  'market:write',
  'leads:read',
  'leads:write',
  'content:write',
  'content:publish',
  'club:manage',
  'users:manage',
  'settings:write',
  'audit:read',
  'ai:review',
  'admin:access',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  customer: [],
  operator: ['admin:access', 'pricing:write', 'market:write', 'catalog:read'],
  sales: ['admin:access', 'leads:read', 'leads:write', 'catalog:read'],
  content: ['admin:access', 'content:write', 'content:publish'],
  catalog: ['admin:access', 'catalog:read', 'catalog:write'],
  admin: ADMIN_ALL,
};

/** Does this role hold the permission? */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Convenience: can the role enter the admin area at all? */
export function canAccessAdmin(role: Role | undefined | null): boolean {
  return can(role, 'admin:access');
}

/**
 * Admin sub-path → permission required to view it. Single source of truth
 * shared by the admin nav filter (admin/layout.tsx) and the edge-level
 * `middleware.ts` gate — each admin/*\/page.tsx also calls `requirePermission`
 * with the matching entry below as defense-in-depth.
 */
export const ADMIN_PATH_PERMISSIONS: Array<[prefix: string, permission: Permission]> = [
  ['/admin/pricing', 'pricing:write'],
  ['/admin/marketing', 'leads:read'],
  ['/admin/seo', 'content:write'],
  ['/admin/leads', 'leads:read'],
  ['/admin/orders', 'leads:read'],
  ['/admin/warehouse', 'leads:read'],
  ['/admin/content', 'content:write'],
  ['/admin/catalog', 'catalog:read'],
  ['/admin/users', 'users:manage'],
  ['/admin/settings', 'settings:write'],
  ['/admin/audit', 'audit:read'],
  ['/admin/ai', 'ai:review'],
];

/** The permission required for an admin path, or undefined for the dashboard root. */
export function permissionForAdminPath(pathname: string): Permission | undefined {
  const match = ADMIN_PATH_PERMISSIONS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.[1];
}
