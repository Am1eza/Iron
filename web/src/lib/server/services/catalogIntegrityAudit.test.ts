// @vitest-environment node
/**
 * B-25 (audit-catalog-B-FINAL) — `runCatalogIntegrityChecks` is the shared
 * core behind both `pnpm audit:catalog` and the new daily `catalogAudit`
 * job. Real Postgres coverage of the checks themselves lives in the pg
 * suites for the tables they inspect (`catalogAdminRepo`'s own tests,
 * `factoryOrder.pg.test.ts`, …); this file is about the RUNNER's own
 * contract — every check gets a result, one bad query cannot hide the rest,
 * and "ok" means exactly "ran and found zero offending rows".
 */
import { describe, it, expect, vi } from 'vitest';
import { CATALOG_INTEGRITY_CHECKS, runCatalogIntegrityChecks } from './catalogIntegrityAudit';

describe('CATALOG_INTEGRITY_CHECKS', () => {
  it('has 14 checks, matching the audit-catalog-B-FINAL count', () => {
    expect(CATALOG_INTEGRITY_CHECKS).toHaveLength(14);
  });

  it('every check has a unique name', () => {
    const names = CATALOG_INTEGRITY_CHECKS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('runCatalogIntegrityChecks', () => {
  it('reports ok:true with zero rows for a clean database', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    const results = await runCatalogIntegrityChecks(db);
    expect(results).toHaveLength(CATALOG_INTEGRITY_CHECKS.length);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(CATALOG_INTEGRITY_CHECKS.length);
  });

  it('reports ok:false with the offending sample rows when a check finds something', async () => {
    const db = {
      query: vi.fn().mockImplementation((sql: string) =>
        sql.includes('noncanonical_factory') || sql.includes('factory<>btrim')
          ? Promise.resolve({ rowCount: 2, rows: [{ id: 's1' }, { id: 's2' }] })
          : Promise.resolve({ rowCount: 0, rows: [] }),
      ),
    };
    const results = await runCatalogIntegrityChecks(db);
    const failed = results.find((r) => r.name === 'noncanonical_factory');
    expect(failed!.ok).toBe(false);
    expect(failed!.rowCount).toBe(2);
    expect(failed!.sampleRows).toEqual([{ id: 's1' }, { id: 's2' }]);
    // Everything else still passed — one failing check does not fail the rest.
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it('a query that throws is captured as that check\'s own failure, without aborting the run', async () => {
    let call = 0;
    const db = {
      query: vi.fn().mockImplementation(() => {
        call += 1;
        if (call === 3) return Promise.reject(new Error('relation "skus" does not exist'));
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    };
    const results = await runCatalogIntegrityChecks(db);
    // Every check still produced a result, including the one that threw.
    expect(results).toHaveLength(CATALOG_INTEGRITY_CHECKS.length);
    expect(db.query).toHaveBeenCalledTimes(CATALOG_INTEGRITY_CHECKS.length);
    const errored = results[2]!;
    expect(errored.ok).toBe(false);
    expect(errored.error).toBe('relation "skus" does not exist');
  });

  it('falls back to rows.length when the driver reports rowCount as null', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rowCount: null, rows: [{ id: '1' }] }) };
    const results = await runCatalogIntegrityChecks(db);
    expect(results[0]!.rowCount).toBe(1);
    expect(results[0]!.ok).toBe(false);
  });
});
