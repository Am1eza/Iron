/**
 * One-off migration: consolidate every "sheet" taxonomy branch into the one
 * that's actually real (`sheet`, 8 populated sub-categories, 48 SKUs) and
 * retire the three near-empty duplicates left over from an incomplete
 * migration (`varagh-garm`, `varagh-sard`, `varagh-steel` — together 21
 * sub-categories, only 3 real SKUs, several sub-categories that just
 * duplicate a `sheet` sub-category by another name, and — same anti-pattern
 * already fixed for rebar — a few named after a GRADE instead of a product
 * type).
 *
 * Does, in one transaction:
 *   1. Adds 5 sub-categories `sheet` doesn't have yet, all real product
 *      types (not grades): تسمه, ساندویچ‌پانل, ورق کرکره, ورق شیروانی, ورق
 *      استیل (the last one starts empty — its future SKUs should be
 *      cross-listed into «استیل» via crossListedCategoryIds, not given a
 *      second taxonomy branch).
 *   2. Re-homes the 3 SKUs that exist under the legacy categories to their
 *      matching `sheet` sub-category (grade/size/factory untouched — only
 *      which taxonomy node they live under changes).
 *   3. Deletes `varagh-garm`, `varagh-sard`, `varagh-steel` and everything
 *      under them.
 *
 * Redirects (plain SQL against `redirects`, ON CONFLICT DO NOTHING — same
 * reasoning as mergeGradeSubcategories.ts for not going through the app's
 * redirectsRepo from a standalone script):
 *   - one per retiring category → /prices/sheet
 *   - one per retiring sub-category → its `sheet` equivalent (a grade-named
 *     sub-category with no real equivalent redirects to /prices/sheet)
 *   - one per moved SKU → its new URL under `sheet`
 *
 * Safety:
 *   · dry run by default — pass --apply to write
 *   · sub-category/SKU/category changes are one transaction
 *   · full report printed before any write
 *
 *   ./node_modules/.bin/tsx scripts/consolidateSheet.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../src/lib/server/db/schema';
import { routes } from '../src/lib/routes';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[consolidate-sheet] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

const RETIRE_CATEGORY_SLUGS = ['varagh-garm', 'varagh-sard', 'varagh-steel'];

/** New sub-categories to create under `sheet`, order continues from the 8
 *  that already exist there. */
const NEW_SHEET_SUBS = [
  { slug: 'strip', name: 'تسمه', order: 9 },
  { slug: 'sandwich-panel', name: 'ساندویچ پانل', order: 10 },
  { slug: 'corrugated', name: 'ورق کرکره', order: 11 },
  { slug: 'roofing', name: 'ورق شیروانی', order: 12 },
  { slug: 'steel', name: 'ورق استیل', order: 13 },
] as const;

/** slug (within a retiring category) → destination `sheet` sub-category
 *  slug. Grade-named sub-categories (ST52/A516/CK45) have no real
 *  equivalent — their SKUs (there are none) and their own URL both fall
 *  back to the bare `sheet` category redirect instead of a sub-category
 *  one. */
const SUB_REDIRECT_TARGET: Record<string, string> = {
  'varagh-siah': 'black',
  'varagh-ajdar': 'checkered',
  'varagh-asidshuei': 'pickled',
  'varagh-roghani': 'oiled',
  'varagh-galvanizeh': 'galvanized',
  'varagh-rangi': 'colored',
  'varagh-arsheh-fouladi': 'deck',
  tasme: 'strip',
  'sandevich-panel': 'sandwich-panel',
  'varagh-korkoreh': 'corrugated',
  'varagh-shirvani': 'roofing',
  'varagh-steel': 'steel',
  'varagh-steel-sanati': 'steel',
};

const sheetCat = (await db.select().from(schema.categories).where(eq(schema.categories.slug, 'sheet')))[0];
if (!sheetCat) {
  console.error('[consolidate-sheet] sheet category not found — aborting.');
  await pool.end();
  process.exit(1);
}

const sheetSubs = await db.select().from(schema.subCategories).where(eq(schema.subCategories.categoryId, sheetCat.id));
const sheetSubBySlug = new Map(sheetSubs.map((s) => [s.slug, s]));
// Redirect URLs only need a valid SLUG, not a DB id, so the 5 sub-categories
// this run is about to create count as valid destinations too — without this
// their redirects fell back to the bare /prices/sheet category page instead
// of their new sub-category page.
const knownDestSlugs = new Set([...sheetSubBySlug.keys(), ...NEW_SHEET_SUBS.map((n) => n.slug)]);

const retireCats = await db
  .select()
  .from(schema.categories)
  .where(inArray(schema.categories.slug, RETIRE_CATEGORY_SLUGS));
const retireCatBySlug = new Map(retireCats.map((c) => [c.slug, c]));

console.log(`[consolidate-sheet] sheet: ${sheetCat.id}, ${sheetSubs.length} existing sub(s)`);
for (const slug of RETIRE_CATEGORY_SLUGS) {
  const c = retireCatBySlug.get(slug);
  console.log(c ? `[consolidate-sheet] retiring: ${slug} (${c.id})` : `[consolidate-sheet] retiring: ${slug} — NOT FOUND, skipping`);
}

const retireSubs = retireCats.length
  ? await db
      .select()
      .from(schema.subCategories)
      .where(
        inArray(
          schema.subCategories.categoryId,
          retireCats.map((c) => c.id),
        ),
      )
  : [];

const skusToMove = retireSubs.length
  ? await db
      .select()
      .from(schema.skus)
      .where(
        inArray(
          schema.skus.subCategoryId,
          retireSubs.map((s) => s.id),
        ),
      )
  : [];

const retireSubById = new Map(retireSubs.map((s) => [s.id, s]));
const retireCatById = new Map(retireCats.map((c) => [c.id, c]));

console.log(`\n[consolidate-sheet] ${skusToMove.length} sku(s) to re-home:`);
type SkuRedirect = { from: string; to: string };
const skuRedirects: SkuRedirect[] = [];
const skuMoves: Array<{ id: string; newSubCategoryId: string; newCategoryId: string }> = [];
for (const s of skusToMove) {
  const oldSub = retireSubById.get(s.subCategoryId)!;
  const oldCat = retireCatById.get(oldSub.categoryId)!;
  const targetSlug = SUB_REDIRECT_TARGET[oldSub.slug];
  const targetSub = targetSlug ? sheetSubBySlug.get(targetSlug) : undefined;
  if (!targetSub) {
    console.log(`  ! ${s.id} under ${oldCat.slug}/${oldSub.slug} — no destination sub-category mapped, ABORTING`);
    await pool.end();
    process.exit(1);
  }
  const from = routes.sku(oldCat.slug, oldSub.slug, s.slug);
  const to = routes.sku('sheet', targetSub.slug, s.slug);
  skuMoves.push({ id: s.id, newSubCategoryId: targetSub.id, newCategoryId: sheetCat.id });
  skuRedirects.push({ from, to });
  console.log(`  · ${s.id}  "${s.name}"  ${oldCat.slug}/${oldSub.slug} → sheet/${targetSub.slug}  (${from} → ${to})`);
}

console.log(`\n[consolidate-sheet] ${NEW_SHEET_SUBS.length} new sheet sub-categories to create:`);
for (const n of NEW_SHEET_SUBS) console.log(`  + ${n.slug}  "${n.name}"`);

console.log(`\n[consolidate-sheet] Redirects to write:`);
const categoryRedirects: SkuRedirect[] = RETIRE_CATEGORY_SLUGS.filter((s) => retireCatBySlug.has(s)).map((slug) => ({
  from: routes.category(slug),
  to: routes.category('sheet'),
}));
const subCategoryRedirects: SkuRedirect[] = [];
for (const sub of retireSubs) {
  const cat = retireCatById.get(sub.categoryId)!;
  const targetSlug = SUB_REDIRECT_TARGET[sub.slug];
  const to = targetSlug && knownDestSlugs.has(targetSlug) ? routes.subCategory('sheet', targetSlug) : routes.category('sheet');
  subCategoryRedirects.push({ from: routes.subCategory(cat.slug, sub.slug), to });
}
const allRedirects = [...categoryRedirects, ...subCategoryRedirects, ...skuRedirects];
for (const r of allRedirects) console.log(`  ${r.from} → ${r.to}`);

console.log(`\n[consolidate-sheet] Plan:`);
console.log(`  1. create ${NEW_SHEET_SUBS.length} sub-categories under sheet`);
console.log(`  2. move ${skuMoves.length} sku(s) to their new sheet sub-category`);
console.log(`  3. delete ${retireCats.length} categories (cascades their ${retireSubs.length} sub-categories)`);
console.log(`  4. insert ${allRedirects.length} redirect row(s)`);

if (!APPLY) {
  console.log(`\n[consolidate-sheet] DRY RUN — no writes made. Re-run with --apply to write.`);
  await pool.end();
  process.exit(0);
}

console.log(`\n[consolidate-sheet] Applying...`);

await db.transaction(async (tx) => {
  for (const n of NEW_SHEET_SUBS) {
    await tx.insert(schema.subCategories).values({
      id: ulid(),
      categoryId: sheetCat.id,
      slug: n.slug,
      name: n.name,
      order: n.order,
    });
  }
  for (const m of skuMoves) {
    await tx
      .update(schema.skus)
      .set({ subCategoryId: m.newSubCategoryId, categoryId: m.newCategoryId })
      .where(eq(schema.skus.id, m.id));
  }
  if (retireCats.length) {
    await tx.delete(schema.categories).where(
      inArray(
        schema.categories.id,
        retireCats.map((c) => c.id),
      ),
    );
  }
});
console.log('[consolidate-sheet] Categories/sub-categories/SKU rows updated.');

for (const r of allRedirects) {
  await pool.query(
    `INSERT INTO redirects (id, from_path, to_path, permanent) VALUES ($1, $2, $3, true)
     ON CONFLICT (from_path) DO NOTHING`,
    [ulid(), r.from, r.to],
  );
  console.log(`  + redirect ${r.from} → ${r.to}`);
}

console.log('[consolidate-sheet] Done.');
await pool.end();
