// @vitest-environment node
/**
 * The daily job wrapper around the pricing (audit C) and order/warehouse
 * (audit E) gates. What the job itself must get right: skip cleanly with no
 * real pg pool, stay silent when every check passes, report exactly ONE
 * error per GATE naming every failing check, and — the part that is specific
 * to this job having two gates — never let one gate's failure stop the other
 * from running.
 *
 * `integrityChecks.pg.test.ts` is the other half: it runs the SQL itself
 * against a real migrated schema, because a check that silently errors is
 * worse than no check (it reports a failure that is about the query, not the
 * data).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const reportErrorMock = vi.fn();
let poolValue: { query: typeof queryMock } | null = { query: queryMock };

vi.mock('@/lib/server/db/client', () => ({ getPool: () => poolValue }));
vi.mock('@/lib/errors/report', () => ({ reportError: reportErrorMock }));

const { dataIntegrityJob } = await import('./dataIntegrity.job');
const { PRICING_INTEGRITY_CHECKS, ORDER_WAREHOUSE_INTEGRITY_CHECKS } =
  await import('@/lib/server/services/integrityChecks');

const TOTAL = PRICING_INTEGRITY_CHECKS.length + ORDER_WAREHOUSE_INTEGRITY_CHECKS.length;

beforeEach(() => {
  queryMock.mockReset();
  reportErrorMock.mockReset();
  poolValue = { query: queryMock };
});

describe('dataIntegrityJob', () => {
  it('does nothing when there is no real pg pool to query', async () => {
    poolValue = null;
    await dataIntegrityJob.run();
    expect(queryMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('runs every check in both gates', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await dataIntegrityJob.run();
    expect(queryMock).toHaveBeenCalledTimes(TOTAL);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reports one error per failing gate, naming every failing check in it', async () => {
    let call = 0;
    queryMock.mockImplementation(() => {
      call += 1;
      // One failure in the pricing gate, two in the warehouse gate.
      const pricingFail = call === 2;
      const warehouseFail = call === PRICING_INTEGRITY_CHECKS.length + 1 || call === TOTAL;
      return Promise.resolve(
        pricingFail || warehouseFail
          ? { rowCount: 4, rows: [{ id: 'x' }] }
          : { rowCount: 0, rows: [] },
      );
    });

    await dataIntegrityJob.run();

    expect(reportErrorMock).toHaveBeenCalledTimes(2);
    const [pricingErr, pricingCtx] = reportErrorMock.mock.calls[0]!;
    expect((pricingErr as Error).message).toContain(`1/${PRICING_INTEGRITY_CHECKS.length}`);
    expect(pricingCtx.gate).toBe('pricing-integrity');
    expect(pricingCtx.failures).toHaveLength(1);

    const [warehouseErr, warehouseCtx] = reportErrorMock.mock.calls[1]!;
    expect((warehouseErr as Error).message).toContain(
      `2/${ORDER_WAREHOUSE_INTEGRITY_CHECKS.length}`,
    );
    expect(warehouseCtx.gate).toBe('order-warehouse-integrity');
    expect(warehouseCtx.failures).toHaveLength(2);
    // `check`, not `name` — a bare `name` key gets silently blanked by
    // lib/errors/report.ts's REDACT_KEYS before it reaches the log/GlitchTip.
    expect(pricingCtx.failures[0]).toHaveProperty('check');
    expect(pricingCtx.failures[0]).not.toHaveProperty('name');
  });

  it('treats a broken query as that check failing, not as the gate passing', async () => {
    // The dangerous direction: a column renamed out from under a check must
    // never read as "no anomalies found".
    queryMock.mockImplementation(() =>
      Promise.reject(new Error('column "quantity_tons" does not exist')),
    );
    await dataIntegrityJob.run();

    expect(reportErrorMock).toHaveBeenCalledTimes(2);
    const [, ctx] = reportErrorMock.mock.calls[0]!;
    expect(ctx.failures[0].error).toContain('does not exist');
  });

  it('still runs the warehouse gate when the pricing gate throws outright', async () => {
    // `runIntegrityChecks` catches per-check errors, so reaching the gate's
    // own catch takes something harder — the pool itself failing.
    let call = 0;
    queryMock.mockImplementation(() => {
      call += 1;
      if (call === 1) throw new Error('pool exhausted');
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    await dataIntegrityJob.run();

    // The pricing gate reported (one check failed), and the warehouse gate
    // still got all of its own queries.
    expect(queryMock).toHaveBeenCalledTimes(TOTAL);
  });

  it('reports no customer data — every check selects ids only', () => {
    // A failure report goes to GlitchTip, so what these queries can return
    // matters. None may select a name, mobile or email column.
    for (const check of [...PRICING_INTEGRITY_CHECKS, ...ORDER_WAREHOUSE_INTEGRITY_CHECKS]) {
      const selected = check.sql.slice(0, check.sql.toLowerCase().indexOf(' from '));
      expect(selected, check.name).not.toMatch(/contact_name|contact_mobile|\bemail\b|\bmobile\b/i);
    }
  });

  it('runs daily', () => {
    expect(dataIntegrityJob.everyMs).toBe(24 * 60 * 60 * 1000);
  });
});
