/**
 * CLI entry for the automated price mirror (US-02.5) — one pass, then exit.
 *
 * Invoked by a HOST cron entry, not by the in-process scheduler in
 * `scheduler.ts`, and not by anyone's chat session:
 *
 *   CRON_TZ=Asia/Tehran
 *   0 8,12 * * * cd /opt/ahantime && docker compose exec -T web node scripts/priceSync.mjs
 *
 * `scheduler.ts` is a `setInterval` loop — it can express "every N ms", not
 * "08:00 and 12:00 Tehran time", and it would restart its phase on every
 * container restart. Host cron is timezone-aware (`CRON_TZ`, cronie ≥ 1.5.2),
 * survives reboots, and runs whether or not anyone is logged in. See
 * `AGENT_REPORT_price_sync_system.md` for the UTC/Tehran arithmetic.
 *
 * A run is bounded by `runPriceSync`'s own claim (`price_sync_runs`), so an
 * overlapping cron tick or a manual trigger from the panel cannot double-write.
 *
 * Exit codes: 0 = ran (including "wrote nothing", which is a legitimate
 * outcome), 1 = the pass failed or the DB is unreachable — so the crontab's
 * own log/MAILTO carries something actionable.
 */
import { hasDb } from '../src/lib/server/db/client';
import { runPriceSync } from '../src/lib/server/services/priceSync.service';

async function main(): Promise<number> {
  if (!hasDb()) {
    console.error('[price-sync] DATABASE_URL not set — nothing to run.');
    return 1;
  }

  const started = Date.now();
  const summary = await runPriceSync({ trigger: 'cron' });
  const seconds = Math.round((Date.now() - started) / 1000);

  if (summary.status === 'disabled') {
    console.log('[price-sync] disabled in settings (PRICE_SYNC.enabled=false) — skipped.');
    return 0;
  }
  if (summary.status === 'busy') {
    console.log('[price-sync] another pass is already running — skipped.');
    return 0;
  }
  if (summary.status === 'failed') {
    console.error(`[price-sync] FAILED after ${seconds}s: ${summary.error ?? 'unknown error'}`);
    return 1;
  }

  console.log(
    `[price-sync] run ${summary.runId} finished in ${seconds}s — ` +
      `${summary.pagesFetched} pages, ${summary.sourceRows} source rows, ` +
      `${summary.consideredSkus} SKUs considered, ${summary.written} written, ${summary.skipped} skipped.`,
  );
  for (const [reason, count] of Object.entries(summary.skipReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`[price-sync]   ${reason}: ${count}`);
  }
  for (const f of summary.fetchFailures) {
    console.warn(`[price-sync]   page failed: ${f.path} — ${f.error}`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[price-sync] crashed:', err);
    process.exit(1);
  });
