import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readMigrations } from './lib/migrations.mjs';
const base = process.env.MIGRATION_BASE_SHA;
const current = readMigrations('./drizzle');
if (!base || /^0+$/.test(base)) throw new Error('MIGRATION_BASE_SHA required');
const previous = JSON.parse(execFileSync('git', ['show', `${base}:web/drizzle/meta/_journal.json`], { encoding: 'utf8' })).entries;
for (let i = 0; i < previous.length; i++) {
  assert.equal(current[i]?.tag, previous[i].tag, 'Existing migration order changed');
  assert.equal(current[i]?.when, previous[i].when, 'Existing migration timestamp changed');
  const before = execFileSync('git', ['show', `${base}:web/drizzle/${previous[i].tag}.sql`]);
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(before).digest('hex'), current[i].hash, 'Applied migration changed');
}
for (const migration of current.slice(previous.length)) {
  const sql = migration.statements.join('\n').replace(/--[^\n]*/g, '');
  if (/\b(DROP\s+(TABLE|COLUMN)|TRUNCATE|ALTER\s+COLUMN\s+\S+\s+(TYPE|SET\s+NOT\s+NULL))\b/i.test(sql)) {
    // Expand/contract has to be allowed to finish, or a column added by
    // mistake could never be removed. The contract half ships alone, marked,
    // and only once no rollback target still reads what it removes -- which
    // checkBackCompat.mjs is what actually verifies.
    if (!migration.contract) {
      throw new Error(`Contract-breaking migration requires a separate maintenance release: ${migration.tag}. `
        + `If every supported release has stopped using these columns, ship it alone with a leading `
        + `"-- contract-release: <why this is safe now>" line.`);
    }
    if (current.length - previous.length !== 1) {
      throw new Error(`A contract-release migration must ship on its own: ${migration.tag}`);
    }
    console.log(`Contract release ${migration.tag}: ${migration.contract}`);
  }
  if (/CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sql) && !migration.online) throw new Error(`Index must use online-indexes-only migration: ${migration.tag}`);
}
console.log(`Migration policy passed (${previous.length} immutable, ${current.length - previous.length} new)`);
