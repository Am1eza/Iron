// Offline audit only: never reads DATABASE_URL or connects to a deployed database.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../src/lib/server/db/schema/index';
import { writeFileSync } from 'node:fs';
const client = new PGlite({ extensions: { pg_trgm } });
try {
 const db = drizzle(client);
 await migrate(db, { migrationsFolder: './drizzle' });
 const before = await client.query('select count(*)::int n from drizzle.__drizzle_migrations');
 await migrate(db, { migrationsFolder: './drizzle' });
 const after = await client.query('select count(*)::int n from drizzle.__drizzle_migrations');
 const columns = (await client.query<any>("select table_name,column_name,is_nullable,data_type from information_schema.columns where table_schema='public'")).rows;
 const configs = Object.values(schema).filter(v => v instanceof PgTable).map(v => getTableConfig(v));
 const drift:any[] = [];
 for (const t of configs) for(const c of t.columns) {
  const actual = columns.find(r=>r.table_name===t.name && r.column_name===c.name);
  if(!actual || (actual.is_nullable==='NO')!==c.notNull) drift.push({table:t.name,column:c.name,expectedNotNull:c.notNull,actual});
 }
 const extraColumns = columns.filter(r=> !configs.some(t=>t.name===r.table_name && t.columns.some(c=>c.name===r.column_name)));
 const fks = (await client.query<any>(`SELECT c.conrelid::regclass::text AS table_name,c.conname,pg_get_constraintdef(c.oid) definition,
 EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indpred IS NULL
 AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey) AS covered
 FROM pg_constraint c WHERE c.contype='f' ORDER BY 1,2`)).rows;
 const indexes = (await client.query<any>("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows;
 const duplicates = indexes.filter((r,i)=>indexes.some((s,j)=>j<i && s.tablename===r.tablename && s.indexdef.split(' USING ')[1]===r.indexdef.split(' USING ')[1] && s.indexdef.includes('UNIQUE')===r.indexdef.includes('UNIQUE')));
 const checks = (await client.query("select conrelid::regclass::text table_name, conname, pg_get_constraintdef(oid) definition from pg_constraint where contype='c' and connamespace='public'::regnamespace order by 1,2")).rows;
 await client.exec('BEGIN');
 let invalidAlertAccepted = false;
 try {
  await client.exec("INSERT INTO users(id,mobile) VALUES ('audit-k','09990000000')");
  await client.exec("INSERT INTO alerts(id,user_id,target_type,op,threshold,status) VALUES ('audit-k-1','audit-k','sku','nonsense',-1,'active'),('audit-k-2','audit-k','sku','nonsense',-1,'active')");
  invalidAlertAccepted = true;
 } catch { invalidAlertAccepted = false; } finally { await client.exec('ROLLBACK'); }
 const result = {scope:'Ephemeral PGlite; column presence/nullability only, not full semantic schema diff or production proof',before:before.rows,after:after.rows,tables:configs.length,columns,columnDrift:drift,extraColumns,foreignKeys:fks,duplicateIndexCandidates:duplicates,indexes,checks,invalidAlertAccepted};
 writeFileSync('../docs/audit-k-evidence/post-fix-offline-schema.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({before:before.rows,after:after.rows,tables:configs.length,columnDrift:drift,extraColumns,foreignKeys:fks.length,uncoveredForeignKeys:fks.filter(r=>!r.covered),duplicateIndexCandidates:duplicates,checkCount:checks.length},null,2));
} finally { await client.close(); }
