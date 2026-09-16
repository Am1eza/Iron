/**
 * K-251 — N−1 compatibility gate.
 *
 * During any rollout both releases are live at once: the new schema is already
 * applied while N−1 containers still serve traffic, and a rollback puts N−1
 * back in front of the new schema for as long as the window lasts. A green
 * `SELECT 1` health check says nothing about that, which is exactly what the
 * audit flagged.
 *
 * This gate proves the new schema still satisfies the PREVIOUS release's data
 * contract, in two halves that together cover both directions of traffic:
 *
 *   reads   every column N−1 selects must still exist and still be selectable.
 *           Proven dynamically: each N−1 table is SELECTed, by explicit column
 *           list, against a real database carrying all current migrations.
 *           `LIMIT 0` is deliberate — this asserts the contract, not the rows.
 *
 *   writes  N−1 INSERTs name only the columns N−1 knew about. So any column
 *           added as NOT NULL without a default breaks every old INSERT the
 *           moment the migration lands. Proven statically, because the failure
 *           is a property of the schema rather than of any one statement.
 *
 * Dropping a column stays legal — expand/contract needs a release that finally
 * removes it — but it may not ride along with the release that stops writing
 * it. That endgame is spelled `-- contract-release: <reason>` at the top of a
 * migration shipping alone: checkMigrationPolicy.mjs enforces the "alone", and
 * this gate then reports each removal it excuses instead of failing on it.
 *
 * Usage: MIGRATION_BASE_SHA=<previous release sha> TEST_DATABASE_URL=… node scripts/checkBackCompat.mjs
 */
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyMigrations, readMigrations } from './lib/migrations.mjs';

const base = process.env.MIGRATION_BASE_SHA;
const url = process.env.TEST_DATABASE_URL;
if (!base || /^0+$/.test(base)) throw new Error('MIGRATION_BASE_SHA required (previous release sha)');
if (!url) throw new Error('TEST_DATABASE_URL required (isolated test cluster)');

const show = (file) => execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });

/** The N−1 schema is the snapshot of the last migration that release shipped. */
function previousSnapshot() {
  const journal = JSON.parse(show('web/drizzle/meta/_journal.json'));
  const last = journal.entries.at(-1);
  if (!last) throw new Error('Previous release has no migrations');
  const file = `web/drizzle/meta/${String(last.idx).padStart(4, '0')}_snapshot.json`;
  return { tag: last.tag, snapshot: JSON.parse(show(file)) };
}

/** postgres reports `varchar(40)`/`numeric(12,2)`; drizzle stores the same
 *  string. Compare the base type so a widened length is not a false alarm. */
const baseType = (type) => type.toLowerCase().split('(')[0].trim();

/** The same lookup, for the release being shipped. */
function currentSnapshot() {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  const last = journal.entries.at(-1);
  return JSON.parse(readFileSync(path.join('drizzle/meta', `${String(last.idx).padStart(4, '0')}_snapshot.json`), 'utf8'));
}

const { tag, snapshot: before } = previousSnapshot();
const after = currentSnapshot();

const breaking = [];
const quote = (id) => `"${id.replaceAll('"', '""')}"`;

/** A migration marked `-- contract-release: <reason>` is the reviewed
 *  statement that no supported release reads the removed columns any more.
 *  checkMigrationPolicy.mjs already forced it to ship alone; here it converts
 *  removals from a failure into a recorded, deliberate act. Removals are the
 *  only thing it excuses -- a type change or a tightened NOT NULL still breaks
 *  a running N-1 container rather than merely a rolled-back one. */
const contractRelease = readMigrations('./drizzle').at(-1)?.contract ?? null;
const removals = [];

for (const [key, oldTable] of Object.entries(before.tables)) {
  const newTable = after.tables[key];
  if (!newTable) {
    (contractRelease ? removals : breaking).push(`table ${oldTable.name} was dropped — release ${tag} still reads it`);
    continue;
  }
  for (const [columnKey, oldColumn] of Object.entries(oldTable.columns)) {
    const newColumn = newTable.columns[columnKey];
    if (!newColumn) {
      (contractRelease ? removals : breaking).push(`${oldTable.name}.${oldColumn.name} was dropped — release ${tag} still reads it`);
      continue;
    }
    if (baseType(newColumn.type) !== baseType(oldColumn.type)) {
      breaking.push(`${oldTable.name}.${oldColumn.name} changed type ${oldColumn.type} → ${newColumn.type}`);
    }
    // Tightening an existing column is just as fatal: N−1 still writes NULL.
    if (newColumn.notNull && !oldColumn.notNull && newColumn.default === undefined) {
      breaking.push(`${oldTable.name}.${oldColumn.name} became NOT NULL without a default — release ${tag} writes NULL`);
    }
  }
  // A column N−1 never knew about is omitted from its INSERTs, so the database
  // has to be able to fill it in unaided.
  for (const [columnKey, newColumn] of Object.entries(newTable.columns)) {
    if (oldTable.columns[columnKey]) continue;
    const generated = newColumn.generated ?? newColumn.identity;
    if (newColumn.notNull && newColumn.default === undefined && !generated) {
      breaking.push(`${newTable.name}.${newColumn.name} is a new NOT NULL column without a default — every ${tag} INSERT into ${newTable.name} fails`);
    }
  }
}

// --- dynamic half: prove N−1's reads still execute on the migrated schema ---
const admin = new pg.Client({ connectionString: url });
const name = `back_compat_${randomUUID().replaceAll('-', '')}`;
const folder = mkdtempSync(path.join(tmpdir(), 'iron-k-backcompat-'));
let client;
await admin.connect();
await admin.query(`CREATE DATABASE ${quote(name)}`);
try {
  cpSync('./drizzle', folder, { recursive: true });
  const target = new URL(url);
  target.pathname = `/${name}`;
  client = new pg.Client({ connectionString: target.toString(), application_name: 'ahantime-backcompat' });
  await client.connect();
  await applyMigrations(client, folder);

  let checked = 0;
  for (const oldTable of Object.values(before.tables)) {
    const columns = Object.values(oldTable.columns).map((c) => quote(c.name)).join(', ');
    const relation = oldTable.schema ? `${quote(oldTable.schema)}.${quote(oldTable.name)}` : quote(oldTable.name);
    try {
      await client.query(`SELECT ${columns} FROM ${relation} LIMIT 0`);
      checked++;
    } catch (error) {
      if (contractRelease) removals.push(`release ${tag} can no longer read ${oldTable.name}: ${error.message}`);
      else breaking.push(`release ${tag} cannot read ${oldTable.name}: ${error.message}`);
    }
  }

  if (breaking.length > 0) {
    console.error(`N−1 compatibility gate FAILED against release ${tag}:`);
    for (const line of breaking) console.error(`  · ${line}`);
    console.error('\nExpand/contract: ship the additive half now and remove the old columns in a');
    console.error('later release, once no N−1 container can be rolled back into.');
    process.exitCode = 1;
  } else {
    if (removals.length > 0) {
      console.warn(`Contract release — deliberately removing what ${tag} used (${contractRelease}):`);
      for (const line of removals) console.warn(`  · ${line}`);
      console.warn('Confirm no rollback target below the current release is still deployable.');
    }
    console.log(JSON.stringify({
      gate: 'K-251 N−1 compatibility', previousRelease: tag,
      contractRelease, deliberateRemovals: removals.length,
      tablesRead: checked, columnsChecked: Object.values(before.tables).reduce((n, t) => n + Object.keys(t.columns).length, 0),
      engine: (await client.query('SELECT version()')).rows[0].version,
      result: 'passed',
    }, null, 2));
  }
} finally {
  await client?.end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`);
  await admin.end();
  rmSync(folder, { recursive: true, force: true });
}
