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
  'leads:manage',
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
 * May this actor move a lead's ownership from `before` to `next`?
 *
 * `leads:write` is the DAY-TO-DAY work of whoever holds a lead (call it, price
 * it, quote it, close it). Deciding WHO holds it is a manager's call, so it
 * needs `leads:manage`: without this split any «کارشناس فروش» could reassign a
 * colleague's lead onto themselves the moment it looked like closing, and the
 * only trace was an audit row nobody reads.
 *
 * A rep still owns their own place in the queue, which is the whole point of
 * «سرنخ من» — so the two self-service moves stay open to `leads:write`:
 * claiming a lead nobody holds, and handing back one they hold. Everything
 * else (taking from a colleague, giving to a colleague) is manager-only.
 *
 * Pure and id-based so both the route guard and the UI can ask the same
 * question and never disagree about which buttons should exist.
 */
export function canChangeLeadAssignee(
  actor: { id: string; role: Role | undefined | null },
  before: string | null,
  next: string | null,
): boolean {
  if (before === next) return true; // no-op: nothing to authorize
  if (can(actor.role, 'leads:manage')) return true;
  if (!can(actor.role, 'leads:write')) return false;
  return (before === null && next === actor.id) || (before === actor.id && next === null);
}

/**
 * May this actor act on a record currently owned by `assigneeId`?
 *
 * A generalization of the ownership half of `canChangeLeadAssignee` for
 * records that inherit their ownership from a lead rather than carrying an
 * `assigneeId` of their own — an ORDER traces back to the lead that became
 * it, so "whose order is this" is really "who does the source lead belong
 * to". True for a manager (holds `leads:manage`), for an unassigned record
 * (nobody's toes to step on), or for the actor's own record. False otherwise
 * — including for a `leads:write`-only actor touching a colleague's record.
 */
export function canActOnAssignedRecord(
  actor: { id: string; role: Role | undefined | null },
  assigneeId: string | null,
): boolean {
  if (can(actor.role, 'leads:manage')) return true;
  return assigneeId === null || assigneeId === actor.id;
}

/**
 * Admin sub-path → permission required to view it. Single source of truth
 * shared by the admin nav filter (admin/layout.tsx) and the edge-level
 * `proxy.ts` gate — each admin/*\/page.tsx also calls `requirePermission`
 * with the matching entry below as defense-in-depth.
 */
export const ADMIN_PATH_PERMISSIONS: Array<[prefix: string, permission: Permission]> = [
  ['/admin/desk', 'leads:read'],
  ['/admin/pricing', 'pricing:write'],
  ['/admin/alerts', 'pricing:write'],
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
