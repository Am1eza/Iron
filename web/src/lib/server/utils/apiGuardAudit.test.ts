// @vitest-environment node
/**
 * `audit()` runs AFTER the write it describes has committed, and
 * `withApiErrorHandling` turns anything thrown inside a handler into a generic
 * 500. So a transient failure inserting the audit row reported «خطایی در سرور
 * رخ داد» for a delete that had already happened: the admin retries, gets a 404
 * (the product is gone), and cannot tell whether the first attempt worked. The
 * row is destroyed either way — reporting the opposite outcome on top of that
 * is the part this pins shut.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { writeAudit } = vi.hoisted(() => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/server/repos/auditRepo', () => ({ writeAudit }));

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('@/lib/errors/report', () => ({ reportError }));

import { audit } from './apiGuard';

beforeEach(() => {
  writeAudit.mockClear();
  reportError.mockClear();
});

describe('audit()', () => {
  it('writes the entry on the happy path', async () => {
    await audit('actor-1', 'catalog.sku.delete', { type: 'sku', id: 'sku-1' }, { name: 'x' }, null);
    expect(writeAudit).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: 'catalog.sku.delete',
      entityType: 'sku',
      entityId: 'sku-1',
      before: { name: 'x' },
      after: null,
    });
  });

  it('does not fail an already-committed write when the audit insert fails', async () => {
    writeAudit.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(
      audit('actor-1', 'catalog.sku.delete', { type: 'sku', id: 'sku-1' }, { name: 'x' }, null),
    ).resolves.toBeUndefined();
  });

  it('reports the failure rather than swallowing it silently', async () => {
    writeAudit.mockRejectedValueOnce(new Error('audit insert failed'));
    await audit('actor-1', 'catalog.sku.delete', { type: 'sku', id: 'sku-1' });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: 'audit', action: 'catalog.sku.delete', entityId: 'sku-1' }),
    );
  });
});
