// Real PG integration: disposable databases only, never migrates the URL's DB.
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyMigrations, readMigrations } from './lib/migrations.mjs';
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error('TEST_DATABASE_URL required (isolated test cluster)');
const admin = new pg.Client({ connectionString: base });
const name = `audit_k_runner_${randomUUID().replaceAll('-', '')}`;
const folder = mkdtempSync(path.join(tmpdir(), 'iron-k-migrations-'));
const connections = [];
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
try {
  cpSync('./drizzle', folder, { recursive: true });
  const url = new URL(base); url.pathname = `/${name}`;
  for (let i = 0; i < 2; i++) {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect(); connections.push(client);
  }
  await Promise.all(connections.map(c => applyMigrations(c, folder)));
  const c = connections[0];
  const total = readMigrations(folder).length;
  assert.equal(Number((await c.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count), total);
  for (let i = 0; i < 10; i++) await applyMigrations(c, folder);
  const first = path.join(folder, '0000_init.sql');
  const old = readFileSync(first, 'utf8');
  writeFileSync(first, old + '\n-- tampered');
  await assert.rejects(applyMigrations(c, folder), /history mismatch/);
  writeFileSync(first, old);
  const journalPath = path.join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.entries.push({ idx: total, version: '7', when: journal.entries.at(-1).when + 1, tag: 'fault_injection', breakpoints: true });
  writeFileSync(journalPath, JSON.stringify(journal));
  writeFileSync(path.join(folder, 'fault_injection.sql'), 'CREATE TABLE k_must_rollback(id int);--> statement-breakpoint\nSELECT 1/0;');
  await assert.rejects(applyMigrations(c, folder));
  assert.equal((await c.query("SELECT to_regclass('k_must_rollback') AS table")).rows[0].table, null);
  assert.equal(Number((await c.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count), total);
  await c.query("SET statement_timeout='100ms'");
  await assert.rejects(c.query('SELECT pg_sleep(1)'), e => e.code === '57014');
  assert.equal((await c.query('SELECT 1 AS ok')).rows[0].ok, 1);
  console.log(JSON.stringify({ engine: (await c.query('SELECT version()')).rows[0].version, migrations: total,
    concurrentRunners: 'passed', restarts: 10, tamperRejection: 'passed', failedDdlRollback: 'passed', timeoutRecovery: 'passed' }, null, 2));
} finally {
  await Promise.all(connections.map(c => c.end()));
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end(); rmSync(folder, { recursive: true, force: true });
}
