/** Read-only, fail-closed catalog integrity gate for staging/production.
 * Usage: pnpm exec tsx scripts/catalogIntegrityAudit.ts */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[catalog-integrity] DATABASE_URL is not set.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
type Check = { name: string; sql: string };
const checks: Check[] = [
  { name: 'orphan_or_mismatched_parent', sql: `select s.id from skus s left join sub_categories sc on sc.id=s.sub_category_id left join categories c on c.id=s.category_id where sc.id is null or c.id is null or sc.category_id<>s.category_id limit 25` },
  { name: 'empty_categories', sql: `select c.id,c.name from categories c where not exists (select 1 from skus s where s.category_id=c.id or coalesce(s.cross_listed_category_ids,'[]'::jsonb) @> jsonb_build_array(c.id)) limit 25` },
  { name: 'empty_subcategories', sql: `select sc.id,sc.name from sub_categories sc left join skus s on s.sub_category_id=sc.id where s.id is null group by sc.id,sc.name limit 25` },
  { name: 'duplicate_category_slug', sql: `select slug,count(*) from categories group by slug having count(*)>1` },
  { name: 'duplicate_subcategory_slug', sql: `select category_id,slug,count(*) from sub_categories group by category_id,slug having count(*)>1` },
  { name: 'duplicate_sku_slug', sql: `select slug,count(*) from skus group by slug having count(*)>1` },
  { name: 'duplicate_structural_sku', sql: `select sub_category_id,identity_key,coalesce(branch_length_m,-1) as length_key,count(*) from skus group by sub_category_id,identity_key,coalesce(branch_length_m,-1) having count(*)>1 limit 25` },
  { name: 'invalid_numeric_or_enum', sql: `select id from skus where "order" not between 0 and 10000 or theoretical_weight_kg<=0 or theoretical_weight_kg>100000 or branch_length_m<=0 or branch_length_m>100 or unit not in ('kg','branch','sheet','meter','piece','sqm') or price_basis not in ('kg','branch','coil','sheet','piece','sqm') limit 25` },
  { name: 'weight_required_for_kg_priced_counted_item', sql: `select id,name from skus where unit in ('branch','sheet','piece') and price_basis='kg' and theoretical_weight_kg is null limit 25` },
  { name: 'branch_basis_without_length', sql: `select id,name from skus where price_basis='branch' and branch_length_m is null limit 25` },
  { name: 'spec_hidden_only_in_name', sql: `select id,name from skus where size is null and name ~ '[۰-۹0-9]' limit 25` },
  { name: 'noncanonical_factory', sql: `select id,factory from skus where factory is not null and (factory<>btrim(factory) or factory like '%'||chr(8204)||'%') limit 25` },
  { name: 'stale_factory_order', sql: `select fo.category_id,fo.factory from factory_order fo where not exists (select 1 from skus s where s.category_id=fo.category_id and s.factory=fo.factory) limit 25` },
  { name: 'unsafe_image_path', sql: `select id,image_url from skus where image_url is not null and image_url !~ '^/uploads/[A-Za-z0-9._-]+$' limit 25` },
];

let failures = 0;
try {
  for (const check of checks) {
    try {
      const result = await pool.query(check.sql);
      if (result.rowCount) {
        failures += 1;
        console.error(`[FAIL] ${check.name}: ${result.rowCount} sample row(s)`, result.rows);
      } else console.log(`[PASS] ${check.name}`);
    } catch (error) {
      failures += 1;
      console.error(`[ERROR] ${check.name}:`, error instanceof Error ? error.message : error);
    }
  }
} finally {
  await pool.end();
}

if (failures > 0) {
  console.error(`[catalog-integrity] ${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`[catalog-integrity] ${checks.length}/${checks.length} checks passed.`);
