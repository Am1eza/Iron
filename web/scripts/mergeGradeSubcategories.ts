/**
 * One-off migration: rebar's "deformed" (آجدار) sub-category was split into
 * two — "آجدار A3" (slug `deformed`, active) and "آجدار A2" (slug
 * `deformed-a2`, already inactive) — with grade baked into the taxonomy
 * itself instead of living only on each SKU's own `grade` column. That's the
 * root cause `composeSkuName` alone can't fix: even with grade dropped from
 * the compose formula, a product's name still starts with its sub-category's
 * own name, and that name carried the grade.
 *
 * This does three things, all inside one transaction:
 *   1. Renames c1-deformed from "آجدار A3" to "آجدار" (slug unchanged, so
 *      this alone breaks no URL — it already holds SKUs of every grade).
 *   2. Re-homes every SKU still under deformed-a2 to point at c1-deformed
 *      instead (their own `grade` column already says A2 — nothing about
 *      the product's data changes, only which taxonomy node it lives
 *      under), and writes a redirect for each SKU's now-changed URL plus one
 *      for the sub-category listing page itself.
 *   3. Deletes the now-empty deformed-a2 row.
 *
 * Everything under deformed-a2 was already `is_active = false` (verified
 * before writing this), so step 2 does not make anything newly visible —
 * activation status is left exactly as it was on every row it touches.
 *
 * Redirect inserts are plain SQL against the `redirects` table rather than
 * going through the app's `redirectsRepo` — that module pulls in
 * `next/server`'s `after()` and the Cloudflare Workers context, both of
 * which assume a live request lifecycle this standalone script doesn't have.
 * The redirect targets here are known-good by construction (the merge target
 * never itself redirects anywhere), so the loop-detection that repo adds on
 * top isn't needed for this one-time write.
 *
 * Safety:
 *   · dry run by default — pass --apply to write
 *   · sub-category + SKU changes are one transaction — either both land or
 *     neither does; redirects are inserted after, ON CONFLICT DO NOTHING
 *     (idempotent — safe to re-run)
 *
 *   ./node_modules/.bin/tsx scripts/mergeGradeSubcategories.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../src/lib/server/db/schema';
import { routes } from '../src/lib/routes';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[merge-grade-sub] DATABASE_URL is not set.');
  process.exit(1);
}

const CATEGORY_SLUG = 'rebar';
const KEEP_SUB_ID = 'c1-deformed';
const KEEP_SUB_NAME = 'آجدار';
const RETIRE_SUB_ID = 'c1-deformed-a2';

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

const keepSubRows = await db.select().from(schema.subCategories).where(eq(schema.subCategories.id, KEEP_SUB_ID));
const retireSubRows = await db.select().from(schema.subCategories).where(eq(schema.subCategories.id, RETIRE_SUB_ID));
const keepSub = keepSubRows[0];
const retireSub = retireSubRows[0];

if (!keepSub || !retireSub) {
  console.error('[merge-grade-sub] Expected sub-category rows not found — aborting without changes.');
  await pool.end();
  process.exit(1);
}

console.log(`[merge-grade-sub] Keep:   ${keepSub.id}  slug=${keepSub.slug}  name="${keepSub.name}"`);
console.log(`[merge-grade-sub] Retire: ${retireSub.id}  slug=${retireSub.slug}  name="${retireSub.name}"`);

const orphanSkus = await db.select().from(schema.skus).where(eq(schema.skus.subCategoryId, RETIRE_SUB_ID));
console.log(`\n[merge-grade-sub] ${orphanSkus.length} sku(s) under ${retireSub.slug} to re-home:`);
const skuRedirects: Array<{ from: string; to: string }> = [];
for (const s of orphanSkus) {
  const from = routes.sku(CATEGORY_SLUG, retireSub.slug, s.slug);
  const to = routes.sku(CATEGORY_SLUG, keepSub.slug, s.slug);
  skuRedirects.push({ from, to });
  console.log(`  · ${s.id}  slug=${s.slug}  name="${s.name}"  grade=${s.grade}  ${from} → ${to}`);
}

const subRedirect = {
  from: routes.subCategory(CATEGORY_SLUG, retireSub.slug),
  to: routes.subCategory(CATEGORY_SLUG, keepSub.slug),
};

console.log(`\n[merge-grade-sub] Plan:`);
console.log(`  1. rename ${keepSub.id}: "${keepSub.name}" → "${KEEP_SUB_NAME}"`);
console.log(`  2. move ${orphanSkus.length} sku(s) from ${retireSub.id} → ${keepSub.id}`);
console.log(`  3. redirect ${subRedirect.from} → ${subRedirect.to}`);
console.log(`  4. delete now-empty ${retireSub.id}`);
console.log(`  5. insert ${1 + skuRedirects.length} redirect row(s)`);

if (!APPLY) {
  console.log(`\n[merge-grade-sub] DRY RUN — no writes made. Re-run with --apply to write.`);
  await pool.end();
  process.exit(0);
}

console.log(`\n[merge-grade-sub] Applying...`);

await db.transaction(async (tx) => {
  await tx.update(schema.subCategories).set({ name: KEEP_SUB_NAME }).where(eq(schema.subCategories.id, KEEP_SUB_ID));
  for (const s of orphanSkus) {
    await tx.update(schema.skus).set({ subCategoryId: KEEP_SUB_ID }).where(eq(schema.skus.id, s.id));
  }
  await tx.delete(schema.subCategories).where(eq(schema.subCategories.id, RETIRE_SUB_ID));
});
console.log('[merge-grade-sub] Sub-category + SKU rows updated.');

for (const r of [subRedirect, ...skuRedirects]) {
  await pool.query(
    `INSERT INTO redirects (id, from_path, to_path, permanent) VALUES ($1, $2, $3, true)
     ON CONFLICT (from_path) DO NOTHING`,
    [ulid(), r.from, r.to],
  );
  console.log(`  + redirect ${r.from} → ${r.to}`);
}

console.log('[merge-grade-sub] Done.');
await pool.end();
