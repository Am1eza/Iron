import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function readMigrations(folder) {
  const entries = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')).entries;
  const files = readdirSync(folder).filter(f => f.endsWith('.sql'));
  if (files.length !== entries.length) throw new Error('Migration files and journal differ');
  return entries.map((entry, i) => {
    if (entry.idx !== i || (i > 0 && entry.when <= entries[i - 1].when)) throw new Error('Invalid migration journal order');
    const filename = `${entry.tag}.sql`;
    if (!files.includes(filename)) throw new Error(`Missing migration ${filename}`);
    const content = readFileSync(path.join(folder, filename), 'utf8');
    // `-- contract-release: <reason>` is the expand/contract endgame: the
    // reviewed statement that no supported release reads these columns any
    // more. It travels in the migration so it shows up in the diff, and both
    // the policy gate and the N-1 gate honour the same marker.
    const contract = /^--\s*contract-release:[ \t]*(\S.*)$/m.exec(content);
    return { ...entry, hash: createHash('sha256').update(content).digest('hex'),
      online: content.startsWith('-- online-indexes-only'),
      contract: contract?.[1]?.trim() ?? null,
      statements: content.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean) };
  });
}

/** One dedicated connection owns the lock, history checks and DDL. */
export async function applyMigrations(client, folder, { checkOnly = false } = {}) {
  const migrations = readMigrations(folder);
  await client.query("SET lock_timeout = '0'");
  await client.query("SET statement_timeout = '120s'");
  await client.query("SET idle_in_transaction_session_timeout = '30s'");
  // A blocking advisory waiter retains a snapshot and can deadlock the
  // winner's CREATE INDEX CONCURRENTLY. Poll between completed statements.
  const deadline = Date.now() + 120000;
  while (!(await client.query('SELECT pg_try_advisory_lock(740249) AS locked')).rows[0].locked) {
    if (Date.now() >= deadline) throw new Error('Migration lock timeout');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const { rows } = await client.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id');
    if (rows.length > migrations.length) throw new Error('Database newer than this release; verify compatibility before rollback');
    rows.forEach((row, i) => {
      if (row.hash !== migrations[i].hash || Number(row.created_at) !== migrations[i].when) {
        throw new Error(`Migration history mismatch at ${migrations[i].tag}`);
      }
    });
    if (checkOnly) {
      if (rows.length !== migrations.length) throw new Error('Pending migrations');
      return;
    }
    for (const migration of migrations.slice(rows.length)) {
      if (migration.online) {
        for (const raw of migration.statements) {
          const stmt = raw.replace(/^--[^\n]*\n/gm, '').trim();
          const match = stmt.match(/^CREATE (UNIQUE )?INDEX "([a-z0-9_]+)" ON "([a-z0-9_]+)" (USING [\s\S]+);$/i);
          if (!match) throw new Error(`Unsafe online statement in ${migration.tag}`);
          const name = match[2];
          const existing = await client.query('SELECT indisvalid,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass($1)', [name]);
          const normalized = value => value.replaceAll('public.', '').replaceAll('\"', '').replaceAll(';', '').replace(/\s+/g, ' ').trim();
          if (existing.rows[0]?.indisvalid && normalized(existing.rows[0].definition) !== normalized(stmt)) throw new Error(`Index definition mismatch: ${name}`);
          if (existing.rows[0] && !existing.rows[0].indisvalid) await client.query(`DROP INDEX CONCURRENTLY "${name}"`);
          if (!existing.rows[0]?.indisvalid) await client.query(stmt.replace(/INDEX /, 'INDEX CONCURRENTLY '));
        }
      }
      await client.query('BEGIN');
      try {
        if (!migration.online) for (const stmt of migration.statements) await client.query(stmt);
        await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ($1,$2)', [migration.hash, migration.when]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(740249)'); }
}
