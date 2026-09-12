/** Read-only, fail-closed catalog integrity gate for staging/production.
 * Usage: pnpm exec tsx scripts/catalogIntegrityAudit.ts
 *
 * B-25 (audit-catalog-B-FINAL) — the 14 checks themselves now live in
 * `src/lib/server/services/catalogIntegrityAudit.ts`, shared with the daily
 * scheduled job (`src/lib/server/jobs/catalogAudit.job.ts`) so the manual
 * command a human runs after a migration and the automated run that watches
 * production every day can never silently drift apart. */
import pg from 'pg';
import { CATALOG_INTEGRITY_CHECKS, runCatalogIntegrityChecks } from '../src/lib/server/services/catalogIntegrityAudit';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[catalog-integrity] DATABASE_URL is not set.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

let failures = 0;
try {
  const results = await runCatalogIntegrityChecks(pool);
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
} finally {
  await pool.end();
}

if (failures > 0) {
  console.error(`[catalog-integrity] ${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`[catalog-integrity] ${CATALOG_INTEGRITY_CHECKS.length}/${CATALOG_INTEGRITY_CHECKS.length} checks passed.`);
