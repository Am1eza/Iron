/**
 * K-254 / K-269 — the observation the audit says is missing.
 *
 * Both findings are blocked on evidence that only time produces. K-254 cannot
 * retire an index from a single reading, because "never scanned" and "scanned
 * only by the month-end job" look identical until a month has passed — its
 * acceptance criterion asks for a 30-day sample that includes the jobs and the
 * end of the month. K-269 wants a growth rate and a saturation date, which is
 * two readings and the interval between them.
 *
 * So this emits one reading, and diffs it against an earlier one when given a
 * `--baseline`. Run it on a schedule and keep the files; the clock starts at
 * the first run, not at the analysis.
 *
 * `statsReset` is reported on every reading and matters more than it looks:
 * pg_stat_user_indexes counters are cumulative since that moment, so a restart
 * or a manual `pg_stat_reset()` silently restarts every counter, and an index
 * that looks unused is often just an index measured over three days. A reading
 * whose baseline predates its own stats reset is not a 30-day sample, and this
 * script refuses to present it as one.
 *
 *   node scripts/observeDatabase.mjs > observations/$(date -u +%Y-%m-%d).json
 *   node scripts/observeDatabase.mjs --baseline observations/2026-08-17.json
 *
 * Read-only: a single transaction, explicitly READ ONLY, that touches catalogs
 * only. It is safe to point at production and that is the point — the numbers
 * it needs do not exist anywhere else.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const baselineArg = process.argv.indexOf('--baseline');
const baseline = baselineArg === -1 ? null : JSON.parse(readFileSync(process.argv[baselineArg + 1], 'utf8'));

/** Free-space alert threshold from K-269's acceptance criterion. */
const FREE_SPACE_ALERT = 0.30;
const DAY = 86_400_000;

const client = new pg.Client({ connectionString: url, application_name: 'ahantime-observe', statement_timeout: 60_000 });
await client.connect();
await client.query('BEGIN READ ONLY');
try {
  const scalar = async (text) => (await client.query(text)).rows[0];

  const { stats_reset: statsReset } = await scalar(
    `SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()`);

  const { rows: tables } = await client.query(`
    SELECT relname AS table,
           pg_total_relation_size(relid)  AS total_bytes,
           pg_table_size(relid)           AS table_bytes,
           pg_indexes_size(relid)         AS index_bytes,
           n_live_tup                     AS live_rows,
           n_dead_tup                     AS dead_rows,
           seq_scan, idx_scan, last_autovacuum, last_autoanalyze
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`);

  // `indisunique` is carried deliberately: an unused unique index is still a
  // constraint, and K-254's acceptance forbids dropping one for a low scan
  // count alone.
  const { rows: indexes } = await client.query(`
    SELECT s.relname AS table, s.indexrelname AS index, s.idx_scan,
           pg_relation_size(s.indexrelid) AS bytes,
           i.indisunique AS unique, i.indisprimary AS primary,
           pg_get_indexdef(s.indexrelid) AS definition
      FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
     ORDER BY pg_relation_size(s.indexrelid) DESC`);

  // An index whose column list is a leading prefix of another's is redundant:
  // postgres can serve its lookups from the wider one. Reported as a candidate
  // to investigate, never as a verdict -- opclass, partiality and INCLUDE all
  // change the answer, so the definitions travel with it.
  const columnsOf = (definition) => {
    const match = /USING \w+ \((.+?)\)(?: INCLUDE| WHERE|$)/.exec(definition);
    return match ? match[1].split(',').map((c) => c.trim()) : [];
  };
  const redundant = [];
  for (const a of indexes) {
    if (a.primary || /WHERE/i.test(a.definition)) continue;
    for (const b of indexes) {
      if (a === b || b.table !== a.table || /WHERE/i.test(b.definition)) continue;
      const [ca, cb] = [columnsOf(a.definition), columnsOf(b.definition)];
      if (ca.length === 0 || ca.length >= cb.length) continue;
      if (ca.every((col, i) => col === cb[i])) {
        redundant.push({ candidate: a.index, coveredBy: b.index, table: a.table,
          candidateScans: Number(a.idx_scan), candidateUnique: a.unique,
          candidateDefinition: a.definition, widerDefinition: b.definition });
      }
    }
  }

  const reading = {
    takenAt: new Date().toISOString(),
    database: (await scalar('SELECT current_database() AS d')).d,
    engine: (await scalar('SELECT version() AS v')).v,
    statsReset: statsReset?.toISOString() ?? null,
    totalBytes: Number((await scalar('SELECT pg_database_size(current_database()) AS b')).b),
    tables: tables.map((t) => ({ ...t, total_bytes: Number(t.total_bytes), table_bytes: Number(t.table_bytes),
      index_bytes: Number(t.index_bytes), live_rows: Number(t.live_rows), dead_rows: Number(t.dead_rows),
      seq_scan: Number(t.seq_scan), idx_scan: Number(t.idx_scan ?? 0) })),
    indexes: indexes.map((i) => ({ ...i, idx_scan: Number(i.idx_scan), bytes: Number(i.bytes) })),
    redundantIndexCandidates: redundant,
  };

  if (!baseline) {
    console.log(JSON.stringify(reading, null, 2));
  } else {
    const days = (Date.parse(reading.takenAt) - Date.parse(baseline.takenAt)) / DAY;
    if (days <= 0) throw new Error('Baseline is not older than this reading');

    // Counters restart at a stats reset, so a window straddling one cannot be
    // read as a rate -- the deltas below would be nonsense rather than merely
    // imprecise.
    const statsContinuous = Boolean(reading.statsReset && baseline.statsReset
      && reading.statsReset === baseline.statsReset);

    const before = new Map(baseline.tables.map((t) => [t.table, t]));
    const growth = reading.tables.map((t) => {
      const was = before.get(t.table);
      const bytesPerDay = was ? (t.total_bytes - was.total_bytes) / days : null;
      return { table: t.table, bytes: t.total_bytes, bytesPerDay,
        rowsPerDay: was ? (t.live_rows - was.live_rows) / days : null };
    }).sort((a, b) => (b.bytesPerDay ?? 0) - (a.bytesPerDay ?? 0));

    const totalPerDay = (reading.totalBytes - baseline.totalBytes) / days;
    const diskBytes = Number(process.env.DATABASE_DISK_BYTES ?? 0);
    const daysToAlert = diskBytes > 0 && totalPerDay > 0
      ? (diskBytes * (1 - FREE_SPACE_ALERT) - reading.totalBytes) / totalPerDay : null;

    const scansBefore = new Map(baseline.indexes.map((i) => [i.index, i.idx_scan]));
    const unusedOverWindow = statsContinuous
      ? reading.indexes
          .filter((i) => !i.primary && !i.unique && scansBefore.has(i.index)
            && i.idx_scan - scansBefore.get(i.index) === 0)
          .map((i) => ({ index: i.index, table: i.table, bytes: i.bytes, definition: i.definition }))
      : [];

    console.log(JSON.stringify({
      window: { from: baseline.takenAt, to: reading.takenAt, days: Number(days.toFixed(2)) },
      // K-254 asks for 30 days including the jobs and a month end.
      windowMeetsK254: statsContinuous && days >= 30,
      statsContinuous,
      statsResetNote: statsContinuous ? null
        : 'Counters were reset inside this window; scan deltas are not a usage sample. Restart the window.',
      totalBytes: reading.totalBytes,
      growthBytesPerDay: Math.round(totalPerDay),
      growthBytesPerMonth: Math.round(totalPerDay * 30),
      daysUntilFreeSpaceAlert: daysToAlert === null ? null : Math.round(daysToAlert),
      freeSpaceAlertAt: daysToAlert !== null ? new Date(Date.now() + daysToAlert * DAY).toISOString()
        : diskBytes <= 0 ? 'set DATABASE_DISK_BYTES to compute a saturation date'
        : 'not growing over this window — no saturation date to project',
      fastestGrowingTables: growth.slice(0, 15),
      unusedOverWindow,
      redundantIndexCandidates: reading.redundantIndexCandidates,
    }, null, 2));
  }
} finally {
  await client.query('COMMIT').catch(() => {});
  await client.end();
}
