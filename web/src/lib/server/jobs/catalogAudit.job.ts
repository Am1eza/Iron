/**
 * B-25 (audit-catalog-B-FINAL) — the daily scheduled run of the catalog
 * integrity gate. `pnpm audit:catalog` (scripts/catalogIntegrityAudit.ts)
 * already existed as a manual/CI command; the audit's own finding was that
 * nothing proved it ran unattended in production, so drift (a stale factory
 * order row, an orphaned SKU, a factory name that stopped being canonical)
 * could sit unnoticed indefinitely. This registers the SAME 13 checks
 * (`lib/server/services/catalogIntegrityAudit.ts`) as a `Job`, exactly like
 * `cleanupJob`/`stalenessJob`, so it runs once a day against the app's own
 * pool and reports through the same GlitchTip path every other job uses —
 * no new alerting infrastructure.
 */
import { getPool } from '@/lib/server/db/client';
import { reportError } from '@/lib/errors/report';
import { runCatalogIntegrityChecks } from '@/lib/server/services/catalogIntegrityAudit';
import type { Job } from './scheduler';

export const catalogAuditJob: Job = {
  name: 'catalogAudit',
  everyMs: 24 * 60 * 60 * 1000,
  async run() {
    // No real pg pool — pglite in tests, or a future runtime target with none
    // (see scheduler.ts's own `hasDb()`/pool checks). Nothing to audit
    // against; the read-only CLI (`pnpm audit:catalog`) remains the way to
    // run this by hand in an environment shaped like that.
    const pool = getPool();
    if (!pool) return;

    const results = await runCatalogIntegrityChecks(pool);
    const failures = results.filter((r) => !r.ok);
    if (failures.length === 0) return;

    // One error report per run (not one per failing check): a single
    // GlitchTip issue naming every failing check is what an operator can act
    // on, where thirteen separate near-identical issues would just be noise.
    reportError(
      new Error(`[catalog-integrity] ${failures.length}/${results.length} check(s) failed`),
      {
        job: 'catalogAudit',
        // `check`, not `name`: `lib/errors/report.ts`'s REDACT_KEYS matches
        // any key containing "name" (to catch `customerName`/`userName`/...)
        // and blanks it to '[redacted]' before this ever reaches the log or
        // GlitchTip — a `name` field here silently destroyed the one piece
        // of information ("which check failed") this report exists to carry.
        failures: failures.map((f) => ({ check: f.name, rowCount: f.rowCount, error: f.error })),
      },
    );
  },
};
