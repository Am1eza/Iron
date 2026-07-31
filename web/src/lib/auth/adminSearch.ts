/**
 * Which entity types the admin command-palette search may return for a role.
 *
 * The palette itself is reachable by every staff role (`admin:access` is the
 * floor), but the four things it can find are governed by four DIFFERENT
 * permissions — a سردبیر محتوا holds the palette and `content:write`, and must
 * never see a lead's name or a customer's mobile through it.
 *
 * Kept here, pure and role-only, so the route handler, the unit test and any
 * future caller all ask the same question. A denied kind is ABSENT from the
 * result — the route must not emit an empty group for it either, since "0
 * سرنخ" still tells the reader that leads exist and roughly how many match.
 */
import { can } from './roles';
import type { Permission, Role } from './types';

export type AdminSearchKind = 'lead' | 'sku' | 'article' | 'user';

/**
 * One command-palette entity hit — the wire contract, shared by the route
 * handler and the typed client so they cannot drift.
 *
 * `href` is the ONLY navigation contract: the palette funnels every result
 * through a single `router.push` behind `checkUnsavedGuard()`, so a hit must
 * never carry click behaviour of its own.
 */
export interface AdminSearchHit {
  kind: AdminSearchKind;
  href: string;
  label: string;
  sublabel?: string;
}

/** Ordered — this is also the order groups appear in the palette. */
export const ADMIN_SEARCH_SCOPES: ReadonlyArray<{ kind: AdminSearchKind; permission: Permission }> = [
  { kind: 'lead', permission: 'leads:read' },
  { kind: 'sku', permission: 'catalog:read' },
  // `content:write` (not `content:publish`): the ability to open an article
  // in the editor is what a search result actually leads to.
  { kind: 'article', permission: 'content:write' },
  { kind: 'user', permission: 'users:manage' },
];

/** The entity kinds this role may search, in palette order. */
export function adminSearchScopesFor(role: Role | undefined | null): AdminSearchKind[] {
  return ADMIN_SEARCH_SCOPES.filter((s) => can(role, s.permission)).map((s) => s.kind);
}

/** May this role search this one entity kind? */
export function canSearchEntity(role: Role | undefined | null, kind: AdminSearchKind): boolean {
  const scope = ADMIN_SEARCH_SCOPES.find((s) => s.kind === kind);
  return scope ? can(role, scope.permission) : false;
}
