/** Read-only, fail-closed pricing integrity gate for staging/production. */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[pricing-integrity] DATABASE_URL is not set.');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
const checks = [
  ['invalid_current_money', `select sku_id,price from current_prices where price not between 1 and 10000000000000 limit 25`],
  ['invalid_history_money', `select id,sku_id,price from price_points where price not between 1 and 10000000000000 limit 25`],
  ['current_without_history', `select cp.sku_id from current_prices cp where not exists(select 1 from price_points pp where pp.sku_id=cp.sku_id) limit 25`],
  ['current_version_missing_from_history', `select cp.sku_id,cp.version from current_prices cp where not exists(select 1 from price_points pp where pp.sku_id=cp.sku_id and pp.version=cp.version) limit 25`],
  ['current_history_mismatch', `select cp.sku_id from current_prices cp join price_points pp on pp.sku_id=cp.sku_id and pp.version=cp.version where (cp.price,cp.unit,cp.price_basis,cp.price_is_estimated) is distinct from (pp.price,pp.unit,pp.price_basis,pp.price_is_estimated) limit 25`],
  ['future_confirmation', `select sku_id,confirmed_at from current_prices where confirmed_at>now()+interval '1 minute' limit 25`],
  ['duplicate_source_event', `select source_event_key,count(*) from price_points where source_event_key is not null group by source_event_key having count(*)>1 limit 25`],
] as const;
let failed = 0;
try {
  await pool.query('BEGIN READ ONLY');
  for (const [name, query] of checks) {
    const result = await pool.query(query);
    if (result.rowCount) {
      failed++;
      console.error(`[FAIL] ${name}: ${result.rowCount} sample row(s)`, result.rows);
    } else console.log(`[PASS] ${name}`);
  }
  await pool.query('ROLLBACK');
} finally {
  await pool.end();
}
if (failed) process.exit(1);
console.log(`[pricing-integrity] ${checks.length}/${checks.length} checks passed.`);
