/**
 * One-off, re-runnable maintenance: finish the لوله/مانیسمان internal-vs-
 * imported split, and hide every sub-category that is live on the public site
 * with nothing in it.
 *
 * Amir's report: «در دسته لوله دسته مانیسمان وقتی میرم روش باید دوتا دسته
 * داخلی و خارجی ظاهر بشه … و در بعضی چیزای دیگه هم همینطور». Two separate
 * problems behind it, both fixed here:
 *
 *  1. مانیسمان — someone created `seamless-internal` («لوله مانیسمان داخلی»)
 *     and `seamless-external` («لوله مانیسمان خارجی»), correctly tagged both
 *     with `groupLabel = 'مانیسمان'`, and then stopped: all 5 real seamless
 *     SKUs stayed on the OLD flat `seamless` row, and the two new rows kept
 *     the `order = 99` they were inserted with. So the visitor saw the old
 *     مانیسمان chip plus two empty ones. This re-homes the 5 SKUs onto
 *     `seamless-internal` (every one of them is an Iranian mill — تهران شرق,
 *     سپنتا, لوله سپاهان — so داخلی is right for all 5), gives the pair
 *     order 1/2 where `seamless` sat, and deactivates the now-empty
 *     `seamless`. `seamless-external` deliberately stays ACTIVE and empty:
 *     showing both داخلی and خارجی is the thing that was asked for, and a
 *     real imported SKU can land in it later.
 *
 *  2. Empty-but-clickable sub-categories — 23 active sub-categories under
 *     active categories hold zero active SKUs, and every one of them renders
 *     as a real chip in the price-table filter bar, the mega-menu, the mobile
 *     drawer and the sitemap, leading to a page with nothing on it. They are
 *     deactivated (`is_active = false`), which is this codebase's own soft
 *     delete — every public read already filters on it (catalogRepo's
 *     tableRows / listAllSubCategories / publicCatalogPaths), so flipping the
 *     flag back is the entire undo. NOTHING is deleted.
 *
 * Two exemptions from (2), both deliberate:
 *   · the 5 sub-categories consolidateSheet.ts (#126) created under `sheet`
 *     hours earlier, explicitly "empty and ready" — KEEP_EMPTY below;
 *   · `seamless-external`, per (1).
 *
 * Redirects (plain SQL against `redirects`, ON CONFLICT DO NOTHING — same
 * reasoning as consolidateSheet.ts for not going through redirectsRepo from a
 * standalone script):
 *   - the 5 moved SKUs' old URLs → their new `seamless-internal` URLs
 *   - each deactivated sub-category → an explicit destination where one is
 *     genuinely equivalent (see SUB_REDIRECT_TARGET), else its category page
 *   - any EXISTING redirect row that points at a URL this run is about to
 *     hide gets re-pointed at the same final destination, so a retired slug
 *     from the US-12.5 rename doesn't 308 into a fresh 404.
 *
 * Safety:
 *   · dry run by default — pass --apply to write
 *   · idempotent: the SKU move, the order fix and the empty-set are all
 *     recomputed from the database, so a second run reports "nothing to do"
 *   · every row change is one transaction; full report printed before it
 *
 *   ./node_modules/.bin/tsx scripts/cleanupEmptySubCategories.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../src/lib/server/db/schema';
import { routes } from '../src/lib/routes';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[cleanup-empty-subs] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

/** `category slug/sub slug` of the مانیسمان split. */
const SEAMLESS_OLD = 'pipe/seamless';
const SEAMLESS_INTERNAL = 'pipe/seamless-internal';
const SEAMLESS_EXTERNAL = 'pipe/seamless-external';

/** Empty sub-categories that must STAY visible — see the header. */
const KEEP_EMPTY = new Set<string>([
  // consolidateSheet.ts (#126) created these hours ago as deliberate,
  // ready-to-fill product types. Not this run's call to hide them.
  'sheet/strip',
  'sheet/sandwich-panel',
  'sheet/corrugated',
  'sheet/roofing',
  'sheet/steel',
  // The whole point of the مانیسمان fix: خارجی is shown next to داخلی.
  SEAMLESS_EXTERNAL,
]);

/**
 * Where a retiring sub-category's URL should 308 to when the category page is
 * NOT the most useful answer. Only genuine same-concept pairs belong here —
 * everything else falls back to `/prices/<category>`.
 */
const SUB_REDIRECT_TARGET: Record<string, string> = {
  // «لوله اسپیرال» is the same product as the already-populated «اسپیرال»
  // (7 SKUs) one row above it — a near-duplicate from the taxonomy import,
  // not a distinct product.
  'pipe/lule-espiral': 'pipe/spiral',
  // «خاموت» (the ULID row) supersedes the old `stirrup`; its 7 SKUs are all
  // switched off, so the category page is the honest destination.
  'rebar/khamut': 'rebar',
  // The old flat مانیسمان row, whose SKUs this run moves to داخلی.
  [SEAMLESS_OLD]: SEAMLESS_INTERNAL,
};

const key = (cat: string, sub: string) => `${cat}/${sub}`;
const destPath = (dest: string) => {
  const [cat, sub] = dest.split('/');
  return sub ? routes.subCategory(cat!, sub) : routes.category(cat!);
};

// ── Read everything up front ────────────────────────────────────────────────
const cats = await db.select().from(schema.categories);
const catById = new Map(cats.map((c) => [c.id, c]));
const subs = await db.select().from(schema.subCategories);
const allSkus = await db
  .select({
    id: schema.skus.id,
    slug: schema.skus.slug,
    name: schema.skus.name,
    factory: schema.skus.factory,
    isActive: schema.skus.isActive,
    subCategoryId: schema.skus.subCategoryId,
  })
  .from(schema.skus);

const subByKey = new Map(
  subs.flatMap((s) => {
    const c = catById.get(s.categoryId);
    return c ? [[key(c.slug, s.slug), s] as const] : [];
  }),
);

const oldSeamless = subByKey.get(SEAMLESS_OLD);
const internal = subByKey.get(SEAMLESS_INTERNAL);
const external = subByKey.get(SEAMLESS_EXTERNAL);
if (!oldSeamless || !internal || !external) {
  console.error(
    `[cleanup-empty-subs] expected all three of ${SEAMLESS_OLD}, ${SEAMLESS_INTERNAL}, ${SEAMLESS_EXTERNAL} to exist — aborting.`,
  );
  await pool.end();
  process.exit(1);
}

// ── 1. مانیسمان: move the SKUs onto داخلی ───────────────────────────────────
const seamlessSkus = allSkus.filter((s) => s.subCategoryId === oldSeamless.id);
console.log(`\n[cleanup-empty-subs] 1. مانیسمان — ${seamlessSkus.length} sku(s) on the old flat "${SEAMLESS_OLD}":`);
for (const s of seamlessSkus) {
  console.log(`  · ${s.id}  "${s.name}"  factory=${s.factory ?? '—'}  active=${s.isActive}  → ${SEAMLESS_INTERNAL}`);
}
const skuRedirects = seamlessSkus.map((s) => ({
  from: routes.sku('pipe', oldSeamless.slug, s.slug),
  to: routes.sku('pipe', internal.slug, s.slug),
}));

// `order` the pair into the slot the old flat row occupied.
const ORDER_INTERNAL = oldSeamless.order;
const ORDER_EXTERNAL = oldSeamless.order + 1;
const orderFixes = [
  { row: internal, from: internal.order, to: ORDER_INTERNAL },
  { row: external, from: external.order, to: ORDER_EXTERNAL },
].filter((f) => f.from !== f.to);
console.log(`\n[cleanup-empty-subs]    order fixes (old "${oldSeamless.slug}" sat at ${oldSeamless.order}):`);
if (!orderFixes.length) console.log('  · none — already correct');
for (const f of orderFixes) console.log(`  · ${f.row.slug}: order ${f.from} → ${f.to}`);
// Every other pipe sub sitting at or after the new external slot is nudged
// down so the two replacements don't collide with an existing order value.
// Guarded on `orderFixes` being non-empty: without that, a second run would
// see the pair already at 1/2 and nudge the same siblings a second time,
// drifting their order by one on every invocation.
const pipeCat = cats.find((c) => c.slug === 'pipe')!;
const nudges = !orderFixes.length
  ? []
  : subs
      .filter(
        (s) =>
          s.categoryId === pipeCat.id &&
          s.id !== internal.id &&
          s.id !== external.id &&
          s.id !== oldSeamless.id &&
          s.order >= ORDER_EXTERNAL &&
          s.order < 99,
      )
      .map((s) => ({ row: s, from: s.order, to: s.order + 1 }));
for (const n of nudges) console.log(`  · ${n.row.slug}: order ${n.from} → ${n.to} (making room)`);

// ── 2. Empty active sub-categories ──────────────────────────────────────────
// Counted AFTER the move above, so داخلی reads as populated and the old flat
// row reads as empty — which is exactly what will be true once this commits.
const movedIds = new Set(seamlessSkus.map((s) => s.id));
const activeSkuCount = new Map<string, number>();
for (const s of allSkus) {
  if (!s.isActive) continue;
  const subId = movedIds.has(s.id) ? internal.id : s.subCategoryId;
  activeSkuCount.set(subId, (activeSkuCount.get(subId) ?? 0) + 1);
}

const toDeactivate = subs
  .filter((s) => {
    const c = catById.get(s.categoryId);
    if (!c || !c.isActive || !s.isActive) return false;
    if ((activeSkuCount.get(s.id) ?? 0) > 0) return false;
    return !KEEP_EMPTY.has(key(c.slug, s.slug));
  })
  .map((s) => {
    const c = catById.get(s.categoryId)!;
    const k = key(c.slug, s.slug);
    return {
      row: s,
      k,
      catSlug: c.slug,
      // Total SKUs (active or not) still parked on the row — a non-zero count
      // here means the products exist but are switched OFF, which is a
      // different problem from a row that was never filled in.
      parked: allSkus.filter((x) => x.subCategoryId === s.id && !movedIds.has(x.id)).length,
      to: destPath(SUB_REDIRECT_TARGET[k] ?? c.slug),
    };
  })
  .sort((a, b) => a.k.localeCompare(b.k));

console.log(`\n[cleanup-empty-subs] 2. ${toDeactivate.length} empty active sub-category(ies) to deactivate:`);
for (const d of toDeactivate) {
  const parked = d.parked ? `  ⚠ ${d.parked} INACTIVE sku(s) parked here` : '';
  console.log(`  − ${d.k}  "${d.row.name}"  → ${d.to}${parked}`);
}
const kept = subs.filter((s) => {
  const c = catById.get(s.categoryId);
  return c && c.isActive && s.isActive && (activeSkuCount.get(s.id) ?? 0) === 0 && KEEP_EMPTY.has(key(c.slug, s.slug));
});
console.log(`\n[cleanup-empty-subs]    ${kept.length} empty sub-category(ies) deliberately KEPT visible:`);
for (const s of kept) console.log(`  = ${key(catById.get(s.categoryId)!.slug, s.slug)}  "${s.name}"`);

// ── 3. Redirects ────────────────────────────────────────────────────────────
const hiddenPaths = new Map(toDeactivate.map((d) => [routes.subCategory(d.catSlug, d.row.slug), d.to]));
const subRedirects = [...hiddenPaths].map(([from, to]) => ({ from, to }));

// Re-point existing rows that would otherwise 308 into a page this run hides.
const existing = await pool.query<{ id: string; from_path: string; to_path: string }>(
  `SELECT id, from_path, to_path FROM redirects`,
);
const repoints = existing.rows
  .filter((r) => hiddenPaths.has(r.to_path) && hiddenPaths.get(r.to_path) !== r.to_path)
  .map((r) => ({ id: r.id, from: r.from_path, oldTo: r.to_path, to: hiddenPaths.get(r.to_path)! }))
  // A chain like A→B where B is itself hidden and re-pointed to A would loop.
  .filter((r) => r.to !== r.from);

const allNew = [...skuRedirects, ...subRedirects].filter((r) => r.from !== r.to);
console.log(`\n[cleanup-empty-subs] 3. ${allNew.length} new redirect row(s):`);
for (const r of allNew) console.log(`  + ${r.from} → ${r.to}`);
console.log(`\n[cleanup-empty-subs]    ${repoints.length} existing redirect row(s) re-pointed:`);
for (const r of repoints) console.log(`  ~ ${r.from}: ${r.oldTo} → ${r.to}`);

console.log(`\n[cleanup-empty-subs] Plan:`);
console.log(`  1. move ${seamlessSkus.length} sku(s) ${SEAMLESS_OLD} → ${SEAMLESS_INTERNAL}`);
console.log(`  2. fix ${orderFixes.length} order value(s) (+${nudges.length} nudged)`);
console.log(`  3. deactivate ${toDeactivate.length} sub-category(ies) — NOTHING is deleted`);
console.log(`  4. insert ${allNew.length} redirect(s), re-point ${repoints.length}`);

if (!APPLY) {
  console.log(`\n[cleanup-empty-subs] DRY RUN — no writes made. Re-run with --apply to write.`);
  await pool.end();
  process.exit(0);
}

console.log(`\n[cleanup-empty-subs] Applying...`);
await db.transaction(async (tx) => {
  if (seamlessSkus.length) {
    await tx
      .update(schema.skus)
      .set({ subCategoryId: internal.id })
      .where(eq(schema.skus.subCategoryId, oldSeamless.id));
  }
  // Nudge first, so the two replacements can take 1/2 without transiently
  // colliding with a row that still holds that value.
  for (const n of nudges) {
    await tx.update(schema.subCategories).set({ order: n.to }).where(eq(schema.subCategories.id, n.row.id));
  }
  for (const f of orderFixes) {
    await tx.update(schema.subCategories).set({ order: f.to }).where(eq(schema.subCategories.id, f.row.id));
  }
  if (toDeactivate.length) {
    await tx
      .update(schema.subCategories)
      .set({ isActive: false })
      .where(
        and(
          inArray(
            schema.subCategories.id,
            toDeactivate.map((d) => d.row.id),
          ),
          eq(schema.subCategories.isActive, true),
        ),
      );
  }
});
console.log('[cleanup-empty-subs] Sub-category / SKU rows updated.');

for (const r of allNew) {
  await pool.query(
    `INSERT INTO redirects (id, from_path, to_path, permanent) VALUES ($1, $2, $3, true)
     ON CONFLICT (from_path) DO NOTHING`,
    [ulid(), r.from, r.to],
  );
  console.log(`  + redirect ${r.from} → ${r.to}`);
}
for (const r of repoints) {
  await pool.query(`UPDATE redirects SET to_path = $1, updated_at = now() WHERE id = $2`, [r.to, r.id]);
  console.log(`  ~ redirect ${r.from} → ${r.to}`);
}

console.log('[cleanup-empty-subs] Done.');
await pool.end();
