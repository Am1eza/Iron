/** Read-only, fail-closed pricing integrity gate for staging/production.
 * Usage: pnpm audit:pricing
 *
 * Audit C — the seven checks themselves now live in
 * `src/lib/server/services/integrityChecks.ts`, shared with the daily
 * scheduled job (`src/lib/server/jobs/dataIntegrity.job.ts`), so the manual
 * command a human runs after a migration and the automated run that watches
 * production every day can never silently drift apart. That scheduled run is
 * also C's answer to its own remaining gap — this script not being bundled
 * into the production image meant the gate could only ever be run by hand,
 * against SQL typed out separately. */
import pg from 'pg';
import {
  PRICING_INTEGRITY_CHECKS,
  runIntegrityChecks,
} from '../src/lib/server/services/integrityChecks';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[pricing-integrity] DATABASE_URL is not set.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });

let failures = 0;
try {
  // READ ONLY is belt and braces: every check is a SELECT, and this makes a
  // future edit that isn't fail loudly rather than write to production.
  await pool.query('BEGIN READ ONLY');
  const results = await runIntegrityChecks(pool, PRICING_INTEGRITY_CHECKS);
  for (const result of results) {
    if (result.error) {
      failures += 1;
      console.error(`[ERROR] ${result.name}:`, result.error);
    } else if (!result.ok) {
      failures += 1;
      console.error(`[FAIL] ${result.name}: ${result.rowCount} sample row(s)`, result.sampleRows);
    } else {
      console.log(`[PASS] ${result.name}`);
    }
  }
  await pool.query('ROLLBACK');
} finally {
  await pool.end();
}

if (failures > 0) {
  console.error(`[pricing-integrity] ${failures} check(s) failed.`);
  process.exit(1);
}
console.log(
  `[pricing-integrity] ${PRICING_INTEGRITY_CHECKS.length}/${PRICING_INTEGRITY_CHECKS.length} checks passed.`,
);
