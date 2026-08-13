/**
 * One-off migration: «استیل» stops owning its own sub-categories.
 *
 * Going forward it's a pure cross-listing hub (see catalog.ts's
 * crossListedCategoryIds) — its page pulls in steel-variant products from
 * their REAL home (pipe/profile/angle-channel/sheet each already have, or
 * now have, their own "X استیل" sub-category). The 4 sub-categories still
 * sitting directly under the «استیل» category row are exact duplicates of
 * those real ones (same Persian name, different id) left over from before
 * cross-listing existed. All 4 are empty — confirmed before writing this —
 * so this is pure taxonomy cleanup, no product data involved.
 *
 * Deletes, with a redirect from each retiring sub-category's own listing
 * page to its real equivalent (or to the bare /prices/steel hub when there
 * isn't a single equivalent — angle-channel splits نبشی/ناودانی into two,
 * «استیل» had them combined into one).
 *
 * Safety: dry run by default — pass --apply to write.
 *   ./node_modules/.bin/tsx scripts/cleanupSteelDuplicates.ts
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
  console.error('[cleanup-steel-dup] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

const RETIRE_SLUGS = ['lule-steel', 'nabshi-va-navdani-steel', 'profil-steel', 'varagh-steel'] as const;
const REDIRECT_TARGET: Partial<Record<(typeof RETIRE_SLUGS)[number], { catSlug: string; subSlug: string }>> = {
  'lule-steel': { catSlug: 'pipe', subSlug: 'lule-steel' },
  'profil-steel': { catSlug: 'profile', subSlug: 'profil-steel' },
  'varagh-steel': { catSlug: 'sheet', subSlug: 'steel' },
  // nabshi-va-navdani-steel has no single equivalent — angle-channel keeps
  // نبشی استیل and ناودانی استیل as two separate sub-categories.
};

const steelCat = (await db.select().from(schema.categories).where(eq(schema.categories.slug, 'steel')))[0];
if (!steelCat) {
  console.error('[cleanup-steel-dup] steel category not found — aborting.');
  await pool.end();
  process.exit(1);
}

const subs = await db
  .select()
  .from(schema.subCategories)
  .where(inArray(schema.subCategories.slug, [...RETIRE_SLUGS]));
const ownSubs = subs.filter((s) => s.categoryId === steelCat.id);

console.log(`[cleanup-steel-dup] steel category: ${steelCat.id}`);
console.log(`[cleanup-steel-dup] ${ownSubs.length} of its own sub-categories to retire:\n`);

const skuCounts = ownSubs.length
  ? await db
      .select({ subCategoryId: schema.skus.subCategoryId })
      .from(schema.skus)
      .where(
        inArray(
          schema.skus.subCategoryId,
          ownSubs.map((s) => s.id),
        ),
      )
  : [];
if (skuCounts.length > 0) {
  console.error(`[cleanup-steel-dup] ${skuCounts.length} sku(s) found under sub-categories expected to be empty — ABORTING, re-check before running.`);
  await pool.end();
  process.exit(1);
}

const redirects: Array<{ from: string; to: string }> = [];
for (const s of ownSubs) {
  const target = REDIRECT_TARGET[s.slug as (typeof RETIRE_SLUGS)[number]];
  const to = target ? routes.subCategory(target.catSlug, target.subSlug) : routes.category('steel');
  const from = routes.subCategory('steel', s.slug);
  redirects.push({ from, to });
  console.log(`  · ${s.id}  "${s.name}"  ${from} → ${to}`);
}

console.log(`\n[cleanup-steel-dup] Plan: delete ${ownSubs.length} sub-categories, insert ${redirects.length} redirect(s).`);

if (!APPLY) {
  console.log(`\n[cleanup-steel-dup] DRY RUN — no writes made. Re-run with --apply to write.`);
  await pool.end();
  process.exit(0);
}

console.log(`\n[cleanup-steel-dup] Applying...`);
if (ownSubs.length) {
  await db.delete(schema.subCategories).where(
    inArray(
      schema.subCategories.id,
      ownSubs.map((s) => s.id),
    ),
  );
}
for (const r of redirects) {
  await pool.query(
    `INSERT INTO redirects (id, from_path, to_path, permanent) VALUES ($1, $2, $3, true)
     ON CONFLICT (from_path) DO NOTHING`,
    [ulid(), r.from, r.to],
  );
  console.log(`  + redirect ${r.from} → ${r.to}`);
}
console.log('[cleanup-steel-dup] Done.');
await pool.end();
