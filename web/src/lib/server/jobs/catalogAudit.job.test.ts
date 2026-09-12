// @vitest-environment node
/**
 * B-25 (audit-catalog-B-FINAL) — the daily job wrapper around
 * `runCatalogIntegrityChecks`. What this job itself must get right: skip
 * cleanly when there is no real pg pool to query, stay silent when every
 * check passes, and report exactly ONE GlitchTip error naming every failing
 * check when something is wrong — not one issue per failing check, and not
 * zero.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const reportErrorMock = vi.fn();
let poolValue: { query: typeof queryMock } | null = { query: queryMock };

vi.mock('@/lib/server/db/client', () => ({
  getPool: () => poolValue,
}));
vi.mock('@/lib/errors/report', () => ({
  reportError: reportErrorMock,
}));

const { catalogAuditJob } = await import('./catalogAudit.job');

beforeEach(() => {
  queryMock.mockReset();
  reportErrorMock.mockReset();
  poolValue = { query: queryMock };
});

describe('catalogAuditJob', () => {
  it('does nothing when there is no real pg pool to query', async () => {
    poolValue = null;
    await catalogAuditJob.run();
    expect(queryMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reports nothing when every check passes', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await catalogAuditJob.run();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reports exactly one error naming every failing check when something is wrong', async () => {
    let call = 0;
    queryMock.mockImplementation(() => {
      call += 1;
      // Two of the fourteen checks come back with offending rows.
      if (call === 1 || call === 5) return Promise.resolve({ rowCount: 3, rows: [{ id: 'x' }] });
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    await catalogAuditJob.run();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const [error, context] = reportErrorMock.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('2/14');
    expect(context.job).toBe('catalogAudit');
    expect(context.failures).toHaveLength(2);
  });

  it('runs daily', () => {
    expect(catalogAuditJob.everyMs).toBe(24 * 60 * 60 * 1000);
  });
});
