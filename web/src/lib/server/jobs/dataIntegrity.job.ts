/**
 * The daily unattended run of the pricing (audit C) and order/warehouse
 * (audit E) integrity gates — the piece both audits recorded as missing.
 *
 * C's own conclusion: «`pnpm audit:pricing` … هنوز داخل image تولیدی باندل
 * نشده». E's: the reconciliation queries "PASS on an empty database" showed
 * the queries were correct, not that the real chain was. Neither gap closes
 * by bundling a script someone still has to remember to run — so this
 * registers the same checks as a `Job`, exactly like `catalogAuditJob`
 * already does for audit B's fourteen.
 *
 * Money first: the pricing checks guard the numbers a customer is quoted
 * (a `current_prices` row that no longer matches its own history version is
 * a price nobody can reconstruct), and the warehouse checks guard stock and
 * settlement arithmetic. A failure in either is the kind of thing that is
 * cheap to fix the day it appears and expensive to fix a quarter later.
 *
 * Reporting goes through `reportError` → GlitchTip, the same path every
 * other job's failures take. No new alerting infrastructure, and the checks
 * only ever SELECT ids, so a failure report carries no customer data.
 */
import { getPool } from '@/lib/server/db/client';
import { reportError } from '@/lib/errors/report';
import {
  ORDER_WAREHOUSE_INTEGRITY_CHECKS,
  PRICING_INTEGRITY_CHECKS,
  runIntegrityChecks,
  type IntegrityCheck,
} from '@/lib/server/services/integrityChecks';
import type { Job } from './scheduler';

async function runGate(gate: string, checks: readonly IntegrityCheck[]): Promise<void> {
  // No real pg pool — pglite in tests, or a runtime target with none (see
  // scheduler.ts's own `hasDb()`/pool checks). Nothing to audit against; the
  // read-only CLI remains the way to run this by hand in such an environment.
  const pool = getPool();
  if (!pool) return;

  const results = await runIntegrityChecks(pool, checks);
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) return;

  // One report per gate, not one per failing check: a single issue naming
  // every failing check is what an operator can act on, where twenty
  // near-identical issues would just be noise. Same reasoning, and same
  // shape, as catalogAudit.job.ts.
  reportError(new Error(`[${gate}] ${failures.length}/${results.length} check(s) failed`), {
    job: 'dataIntegrity',
    gate,
    failures: failures.map((f) => ({ name: f.name, rowCount: f.rowCount, error: f.error })),
  });
}

export const dataIntegrityJob: Job = {
  name: 'dataIntegrity',
  everyMs: 24 * 60 * 60 * 1000,
  async run() {
    // Sequential, and each gate independently guarded: a thrown pricing gate
    // must not stop the warehouse one from ever running.
    for (const [gate, checks] of [
      ['pricing-integrity', PRICING_INTEGRITY_CHECKS],
      ['order-warehouse-integrity', ORDER_WAREHOUSE_INTEGRITY_CHECKS],
    ] as const) {
      try {
        await runGate(gate, checks);
      } catch (error) {
        reportError(error, { job: 'dataIntegrity', gate, stage: 'gate_failed' });
      }
    }
  },
};
