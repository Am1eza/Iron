import { describe, expect, it } from 'vitest';
import { can } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { resolveLeadExportScope } from './filters';

const ME = 'user_rep_1';
const SOMEONE_ELSE = 'user_rep_2';

/** Derived, not hard-coded: if the permission table ever grants a new role
 *  `leads:manage`, this test starts covering it instead of going stale. */
const ROLES_WITH_READ: Role[] = (['customer', 'operator', 'sales', 'content', 'catalog', 'admin'] as Role[]).filter((r) =>
  can(r, 'leads:read'),
);
const MANAGERS = ROLES_WITH_READ.filter((r) => can(r, 'leads:manage'));
const NON_MANAGERS = ROLES_WITH_READ.filter((r) => !can(r, 'leads:manage'));

describe('resolveLeadExportScope', () => {
  it('has both a manager and a non-manager to test, or these tests prove nothing', () => {
    expect(MANAGERS.length).toBeGreaterThan(0);
    expect(NON_MANAGERS.length).toBeGreaterThan(0);
  });

  it('forces a plain rep onto their own book when they ask for everything', () => {
    for (const role of NON_MANAGERS) {
      const scope = resolveLeadExportScope({ role, actorId: ME, requested: {} });
      expect(scope.ok, role).toBe(true);
      if (scope.ok) {
        expect(scope.filters.assigneeId, role).toBe(ME);
        expect(scope.unrestricted).toBe(false);
      }
    }
  });

  it('refuses a rep who names another rep explicitly', () => {
    for (const role of NON_MANAGERS) {
      expect(resolveLeadExportScope({ role, actorId: ME, requested: { assigneeId: SOMEONE_ELSE } }).ok, role).toBe(false);
    }
  });

  it('lets a rep export their own filtered slice unchanged', () => {
    for (const role of NON_MANAGERS) {
      const scope = resolveLeadExportScope({
        role,
        actorId: ME,
        requested: { assigneeId: ME, status: 'won', q: 'تهران' },
      });
      expect(scope.ok, role).toBe(true);
      if (scope.ok) expect(scope.filters).toEqual({ assigneeId: ME, status: 'won', q: 'تهران' });
    }
  });

  it('leaves a manager’s request completely untouched, including whole-table', () => {
    for (const role of MANAGERS) {
      const whole = resolveLeadExportScope({ role, actorId: ME, requested: {} });
      expect(whole.ok, role).toBe(true);
      if (whole.ok) {
        expect(whole.filters.assigneeId, role).toBeUndefined();
        expect(whole.unrestricted).toBe(true);
      }
      const other = resolveLeadExportScope({ role, actorId: ME, requested: { assigneeId: SOMEONE_ELSE } });
      expect(other.ok, role).toBe(true);
      if (other.ok) expect(other.filters.assigneeId).toBe(SOMEONE_ELSE);
    }
  });

  it('never mutates the caller’s filter object', () => {
    for (const role of NON_MANAGERS) {
      const requested = { status: 'new' as const };
      resolveLeadExportScope({ role, actorId: ME, requested });
      expect(requested, role).toEqual({ status: 'new' });
    }
  });
});
