import { describe, it, expect } from 'vitest';
import { can, canAccessAdmin, canChangeLeadAssignee } from './roles';

describe('RBAC', () => {
  it('admin holds every permission', () => {
    expect(can('admin', 'users:manage')).toBe(true);
    expect(can('admin', 'pricing:write')).toBe(true);
    expect(canAccessAdmin('admin')).toBe(true);
  });

  it('operator can price but cannot manage users', () => {
    expect(can('operator', 'pricing:write')).toBe(true);
    expect(can('operator', 'users:manage')).toBe(false);
    expect(canAccessAdmin('operator')).toBe(true);
  });

  it('customers have no permissions and no admin access', () => {
    expect(can('customer', 'leads:read')).toBe(false);
    expect(canAccessAdmin('customer')).toBe(false);
  });

  it('null/undefined roles are denied', () => {
    expect(can(undefined, 'admin:access')).toBe(false);
    expect(can(null, 'pricing:write')).toBe(false);
  });

  it('only admin manages the lead pipeline', () => {
    expect(can('admin', 'leads:manage')).toBe(true);
    // The split is the whole point: sales still does the day-to-day work.
    expect(can('sales', 'leads:write')).toBe(true);
    expect(can('sales', 'leads:manage')).toBe(false);
  });
});

describe('canChangeLeadAssignee', () => {
  const rep = { id: 'rep-1', role: 'sales' as const };
  const boss = { id: 'boss-1', role: 'admin' as const };

  it('lets a rep claim a lead nobody holds', () => {
    expect(canChangeLeadAssignee(rep, null, rep.id)).toBe(true);
  });

  it('lets a rep hand back a lead they hold', () => {
    expect(canChangeLeadAssignee(rep, rep.id, null)).toBe(true);
  });

  it('stops a rep taking a colleague\'s lead — the commission-theft case', () => {
    expect(canChangeLeadAssignee(rep, 'rep-2', rep.id)).toBe(false);
  });

  it('stops a rep pushing their lead onto a colleague', () => {
    expect(canChangeLeadAssignee(rep, rep.id, 'rep-2')).toBe(false);
    expect(canChangeLeadAssignee(rep, null, 'rep-2')).toBe(false);
  });

  it('stops a rep releasing a colleague\'s lead back to the pool', () => {
    expect(canChangeLeadAssignee(rep, 'rep-2', null)).toBe(false);
  });

  it('lets an admin move a lead between any two people', () => {
    expect(canChangeLeadAssignee(boss, 'rep-2', 'rep-1')).toBe(true);
    expect(canChangeLeadAssignee(boss, 'rep-2', null)).toBe(true);
    expect(canChangeLeadAssignee(boss, null, 'rep-2')).toBe(true);
  });

  it('treats a no-op as allowed so an unrelated status PATCH is never refused', () => {
    expect(canChangeLeadAssignee(rep, 'rep-2', 'rep-2')).toBe(true);
    expect(canChangeLeadAssignee(rep, null, null)).toBe(true);
  });

  it('denies roles with no lead access at all, and an unhydrated session', () => {
    expect(canChangeLeadAssignee({ id: 'c-1', role: 'content' }, null, 'c-1')).toBe(false);
    expect(canChangeLeadAssignee({ id: 'x', role: undefined }, null, 'x')).toBe(false);
  });
});
