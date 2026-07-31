import { describe, it, expect } from 'vitest';
import { adminSearchScopesFor, canSearchEntity } from './adminSearch';
import { STAFF_ROLES } from './roles';

describe('adminSearchScopesFor — per-entity palette scoping', () => {
  it('admin searches everything', () => {
    expect(adminSearchScopesFor('admin')).toEqual(['lead', 'sku', 'article', 'user']);
  });

  it('content editor searches articles and NOTHING else', () => {
    // The regression this guards: a content role holds `admin:access`, so it
    // reaches the palette — gating the route at `leads:read` would have been
    // wrong in the other direction, and gating nothing leaks customer data.
    expect(adminSearchScopesFor('content')).toEqual(['article']);
    expect(canSearchEntity('content', 'lead')).toBe(false);
    expect(canSearchEntity('content', 'user')).toBe(false);
    expect(canSearchEntity('content', 'sku')).toBe(false);
  });

  it('sales searches leads and the catalog, never users or articles', () => {
    expect(adminSearchScopesFor('sales')).toEqual(['lead', 'sku']);
    expect(canSearchEntity('sales', 'user')).toBe(false);
    expect(canSearchEntity('sales', 'article')).toBe(false);
  });

  it('operator and catalog roles reach the catalog only', () => {
    expect(adminSearchScopesFor('operator')).toEqual(['sku']);
    expect(adminSearchScopesFor('catalog')).toEqual(['sku']);
  });

  it('customers and unauthenticated callers search nothing', () => {
    expect(adminSearchScopesFor('customer')).toEqual([]);
    expect(adminSearchScopesFor(undefined)).toEqual([]);
    expect(adminSearchScopesFor(null)).toEqual([]);
  });

  it('only `users:manage` holders can search users', () => {
    const withUsers = STAFF_ROLES.filter((r) => canSearchEntity(r, 'user'));
    expect(withUsers).toEqual(['admin']);
  });
});
