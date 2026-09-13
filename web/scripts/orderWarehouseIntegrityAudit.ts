/** Read-only inventory/accounting anomaly scan. Never prints customer data —
 * every check selects ids only.
 * Usage: pnpm audit:orders
 *
 * Audit E — the twenty checks themselves now live in
 * `src/lib/server/services/integrityChecks.ts`, shared with the daily
 * scheduled job (`src/lib/server/jobs/dataIntegrity.job.ts`), so the manual
 * command and the unattended run that watches production cannot drift apart.
 * E's own conclusion was that a PASS against an empty database proves the
 * queries are well-formed, not that the real settlement chain reconciles;
 * running them daily against live data is what turns them into evidence. */
import pg from 'pg';
import {
  ORDER_WAREHOUSE_INTEGRITY_CHECKS,
  runIntegrityChecks,
} from '../src/lib/server/services/integrityChecks';

if (!process.env.DATABASE_URL) {
  console.error('[order-warehouse-integrity] DATABASE_URL is not set.');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
});

let failures = 0;
const client = await pool.connect();
try {
  // One consistent snapshot for all twenty checks: a cross-table anomaly
  // (stock vs. its ledger) read across two different snapshots could report
  // a mismatch that never actually existed.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");

  const results = await runIntegrityChecks(client, ORDER_WAREHOUSE_INTEGRITY_CHECKS);
  for (const result of results) {
    if (result.error) {
      failures += 1;
      console.error(`[ERROR] ${result.name}:`, result.error);
    } else if (!result.ok) {
      failures += 1;
      console.error(`[FAIL] ${result.name}: ${result.rowCount}`, result.sampleRows);
    } else {
      console.log(`[PASS] ${result.name}`);
    }
  }
  console.log(
    `SUMMARY: ${ORDER_WAREHOUSE_INTEGRITY_CHECKS.length - failures}/${ORDER_WAREHOUSE_INTEGRITY_CHECKS.length} integrity controls passed.`,
  );
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}

if (failures) process.exitCode = 1;
