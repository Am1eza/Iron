import { describe, it, expect } from 'vitest';
import { can, canAccessAdmin } from './roles';

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
});
