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

import { audit, withApiErrorHandling } from './apiGuard';
import { PayloadTooLargeError } from './requestBody';

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

describe('audit(..., tx) — G-160: sensitive writes (role changes) share a transaction with their audit row', () => {
  it('passes the tx through to writeAudit instead of using the pooled db', async () => {
    const fakeTx = { __fakeTx: true } as never;
    await audit('actor-1', 'user.update', { type: 'user', id: 'u-1' }, { role: 'sales' }, { role: 'admin' }, fakeTx);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.update', tx: fakeTx }),
    );
  });

  it('propagates (does NOT swallow) an audit-insert failure when a tx is given — the opposite of the no-tx case above', async () => {
    writeAudit.mockRejectedValueOnce(new Error('audit insert failed'));
    const fakeTx = { __fakeTx: true } as never;
    await expect(
      audit('actor-1', 'user.update', { type: 'user', id: 'u-1' }, undefined, undefined, fakeTx),
    ).rejects.toThrow('audit insert failed');
    // Unlike the no-tx path, this must NOT be swallowed into a reportError —
    // it needs to actually throw so the caller's db.transaction() rolls back
    // the role change it was about to commit alongside this row.
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('request size errors at the API boundary', () => {
  it('returns 413 without flooding error reporting', async () => {
    const handler = withApiErrorHandling(() => {
      throw new PayloadTooLargeError();
    });
    const response = await handler();
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'payload_too_large' });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('still reports genuine unexpected errors as 500', async () => {
    const handler = withApiErrorHandling(() => {
      throw new Error('unexpected');
    });
    expect((await handler()).status).toBe(500);
    expect(reportError).toHaveBeenCalledOnce();
  });
});
