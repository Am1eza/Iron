/**
 * One-off, re-runnable repair: stop three stale `redirects` rows from hiding
 * three LIVE پروفیل sub-category pages, one of which sells a priced product.
 *
 * ## What the symptom looked like
 *
 * A production crawl of all 1,235 sitemap URLs (1405/05/31, PR #226) found
 * exactly three 308s, all of this shape:
 *
 *   /prices/profile/prvfyl-snaty      → 308 → /prices/profile
 *   /prices/profile/prvfyl-sakhtmany  → 308 → /prices/profile
 *   /prices/profile/prvfyl-astyl      → 308 → /prices/profile
 *
 * All three `from_path`s are `is_active = true` sub-categories, and
 * `prvfyl-snaty` («پروفیل صنعتی») holds an active, priced SKU. A redirect row
 * beats a real route match in `middleware.ts` by design, so `is_active` alone
 * cannot make those pages reachable.
 *
 * ## What actually happened — NOT an unfinished re-slug
 *
 * The obvious reading is that these are the OLD slugs from the پروفیل re-slug
 * (`renameCatalogSlugs.ts`, PR #224: `prvfyl-*` → `profil-*`) and should be
 * retired in favour of their `profil-*` twins. The audit trail says the
 * opposite, and the fix is the reverse of that. In order:
 *
 *   1405/05/10 (2026-08-01)  the owner creates «پروفیل ساختمانی/صنعتی/استیل»
 *                            in the panel. `slugify()` derives `prvfyl-*`.
 *   1405/05/13 (2026-08-04)  `renameCatalogSlugs.ts` renames THOSE SAME ROWS
 *                            to `profil-sakhtemani` / `profil-sanati` /
 *                            `profil-steel` and writes the old→new redirects.
 *   1405/05/23 (2026-08-14)  all three are still empty, so they are retired:
 *                            `is_active = false`, and BOTH the old and the new
 *                            URL are pointed at `/prices/profile`. That is
 *                            when the three rows above stopped being
 *                            slug→slug maps and became retire-to-parent rows.
 *   1405/05/30 (2026-08-21)  the owner creates the three sub-categories AGAIN,
 *                            fresh rows with new ids, active, ordered into
 *                            place beside the live ones — and five minutes
 *                            later adds «پروفیل صنعتی ۸۰×۸۰» under صنعتی.
 *                            `slugify()` derives `prvfyl-*` a second time,
 *                            straight into the retired URLs.
 *   1405/05/31 (2026-08-22)  the SKU is priced (۱۰۸٬۱۸۲ ت/kg).
 *
 * So the `prvfyl-*` rows are not leftovers. They are the CURRENT پروفیل
 * sub-categories, twelve hours newer than the retirement that buried their
 * URLs, and the shipped code agrees: `catalogLabels.ts` lists `prvfyl-snaty`
 * and `prvfyl-astyl` in `PROFILE_NO_FACTORY_SUBS` and gives them their
 * attribute columns, and `priceSync.match.ts` maps `profile/prvfyl-snaty` to
 * its ahanonline source table. Deactivating them would hide priced stock and
 * strand production code on slugs that no longer exist.
 *
 * The `profil-*` rows ARE the retired ones — inactive, empty, and correctly
 * redirected. They stay exactly as they are.
 *
 * ## Root cause, which this script does not fix
 *
 * `slugify()` drops Persian short vowels («پروفیل» → `prvfyl`, «صنعتی» →
 * `snaty`), so the admin panel regenerates the pre-#224 slug for any row an
 * admin recreates. `renameCatalogSlugs.ts` corrected the DATA with a
 * hand-written map and left the slugifier alone, so the panel walks back into
 * the retired URL every time. Nothing in the create path notices that a
 * `redirects` row already claims the URL it is about to publish. That is a
 * code change for its own PR; this script repairs the three rows it produced.
 *
 * ## What this changes
 *
 *   1. DELETE the three retire-to-parent rows above. Each `from_path` is now
 *      a live route in its own right, so there is no "old URL" left to
 *      preserve — the row is pure shadow. `redirects` has no `is_active`
 *      column (id, from_path, to_path, permanent, created_at, updated_at), so
 *      removal is a DELETE; there is no soft form of it. Guarded hard below:
 *      a row is only ever removed when its `from_path` is an ACTIVE
 *      sub-category AND its `to_path` is that sub-category's own parent
 *      category page. A genuine slug→slug map can never match that shape.
 *   2. REPOINT `/prices/profile/profil-sanati` from the category page to
 *      `/prices/profile/prvfyl-snaty`. The retired slug's own replacement now
 *      exists again, is active, and carries stock, so the old URL should land
 *      on the product page rather than one level up. Only done for a target
 *      that holds an active SKU — `profil-steel` and `profil-sakhtemani` keep
 *      pointing at the category, because their live twins are empty and a
 *      category page is the better landing for a crawler than an empty one.
 *   3. COLLAPSE the one two-hop chain the re-slug left behind:
 *      `/prices/astyl/prvfyl-astyl` → `/prices/steel/profil-steel` →
 *      `/prices/profile` becomes a single hop to `/prices/profile`. Same
 *      destination, one fewer redirect. Asserted, not assumed: the current
 *      target must itself be a `from_path` resolving to the new target.
 *
 * No sub-category and no SKU is touched. Nothing is deactivated: there is no
 * orphaned inventory to migrate and no redundant row to retire — the
 * duplicate-slug pairs are already correctly split into a live half and a
 * retired half.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one transaction; the full report is printed before it
 *   · every deletion is precondition-checked against live catalog state and
 *     the script ABORTS rather than removing a row it cannot justify
 *   · idempotent: a second run recomputes from the database and reports
 *     nothing to do
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/unshadowProfileSubCategories.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

import { routes } from '../src/lib/routes';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[unshadow-profile] DATABASE_URL is not set.');
  process.exit(1);
}

const CATEGORY = 'profile';

/**
 * The sub-categories whose own URL a redirect row is hiding, as
 * `category/sub`. Each must be ACTIVE and its redirect must point at its own
 * parent category — both asserted below.
 */
const UNSHADOW = [`${CATEGORY}/prvfyl-snaty`, `${CATEGORY}/prvfyl-sakhtmany`, `${CATEGORY}/prvfyl-astyl`] as const;

/**
 * Retired-slug URLs to repoint at their live twin. The value must be an
 * ACTIVE sub-category holding at least one ACTIVE SKU — asserted below, so
 * this can never send a crawler to an empty page.
 */
const REPOINT: Readonly<Record<string, string>> = {
  [routes.subCategory(CATEGORY, 'profil-sanati')]: routes.subCategory(CATEGORY, 'prvfyl-snaty'),
};

/**
 * Two-hop chains to collapse: `from` currently points at a path that is
 * itself a `from_path`. The value is the final destination — asserted to be
 * exactly what the second hop already resolves to, so this changes hop count
 * and nothing else.
 */
const COLLAPSE: Readonly<Record<string, string>> = {
  '/prices/astyl/prvfyl-astyl': routes.category(CATEGORY),
};

const pool = new pg.Pool({ connectionString: url, max: 1 });

const die = async (msg: string): Promise<never> => {
  console.error(`[unshadow-profile] ${msg}`);
  await pool.end();
  process.exit(1);
};

type SubRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  cat_slug: string;
  active_skus: number;
};

const { rows: subs } = await pool.query<SubRow>(`
  SELECT s.id, s.slug, s.name, s.is_active, c.slug AS cat_slug,
         (SELECT count(*)::int FROM skus k WHERE k.sub_category_id = s.id AND k.is_active) AS active_skus
    FROM sub_categories s JOIN categories c ON c.id = s.category_id
`);
const byKey = new Map(subs.map((s) => [`${s.cat_slug}/${s.slug}`, s]));

type RedirectRow = { id: string; from_path: string; to_path: string };
const { rows: allRedirects } = await pool.query<RedirectRow>(
  `SELECT id, from_path, to_path FROM redirects`,
);
const byFrom = new Map(allRedirects.map((r) => [r.from_path, r]));

// ── 1. Deletions ────────────────────────────────────────────────────────────
const missing = UNSHADOW.filter((k) => !byKey.has(k));
if (missing.length) await die(`sub-categories absent — aborting: ${missing.join(', ')}`);

const inactive = UNSHADOW.filter((k) => !byKey.get(k)!.is_active);
if (inactive.length) {
  await die(
    `refusing to publish a retired URL: ${inactive.join(', ')} is not active. ` +
      `Its redirect is doing exactly what it should — aborting.`,
  );
}

const toDelete: RedirectRow[] = [];
for (const k of UNSHADOW) {
  const [cat, sub] = k.split('/') as [string, string];
  const path = routes.subCategory(cat, sub);
  const row = byFrom.get(path);
  if (!row) continue; // already removed — idempotent
  const parent = routes.category(cat);
  if (row.to_path !== parent) {
    await die(
      `${path} redirects to ${row.to_path}, not to its own category page ${parent}. ` +
        `That is a real slug map, not a retire-to-parent row — aborting rather than guessing.`,
    );
  }
  toDelete.push(row);
}

// ── 2. Repoints ─────────────────────────────────────────────────────────────
const toRepoint: Array<{ row: RedirectRow; to: string }> = [];
for (const [from, to] of Object.entries(REPOINT)) {
  const row = byFrom.get(from);
  if (!row) await die(`expected an existing redirect at ${from} — aborting.`);
  const key = to.replace(/^\/prices\//, '');
  const target = byKey.get(key);
  if (!target || !target.is_active || target.active_skus === 0) {
    await die(
      `refusing to repoint ${from} at ${to}: that page is missing, inactive, or empty — aborting.`,
    );
  }
  // Checked against the state this run LEAVES behind: a row this run deletes
  // is not a chain the repoint would land in.
  const deleted = new Set(toDelete.map((d) => d.from_path));
  if (byFrom.has(to) && !deleted.has(to)) {
    await die(`${to} is itself redirected — repointing would build a chain. Aborting.`);
  }
  if (row!.to_path !== to) toRepoint.push({ row: row!, to });
}

// ── 3. Chain collapses ──────────────────────────────────────────────────────
const toCollapse: Array<{ row: RedirectRow; to: string; via: string }> = [];
for (const [from, to] of Object.entries(COLLAPSE)) {
  const row = byFrom.get(from);
  if (!row) continue; // already gone — idempotent
  if (row.to_path === to) continue; // already collapsed
  const hop = byFrom.get(row.to_path);
  if (!hop) {
    await die(`${from} → ${row.to_path} is already a single hop, not the chain expected — aborting.`);
  }
  if (hop!.to_path !== to) {
    await die(
      `chain ${from} → ${row.to_path} → ${hop!.to_path} does not end at ${to} — aborting rather than changing where it lands.`,
    );
  }
  toCollapse.push({ row, to, via: row.to_path });
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\n[unshadow-profile] 1. delete ${toDelete.length} redirect(s) shadowing a live page:`);
if (!toDelete.length) console.log('  · none — already removed');
for (const r of toDelete) {
  const key = r.from_path.replace(/^\/prices\//, '');
  const sub = byKey.get(key)!;
  console.log(
    `  − ${r.from_path} → ${r.to_path}   [${r.id}]  (live "${sub.name}", ${sub.active_skus} active sku(s))`,
  );
}

console.log(`\n[unshadow-profile] 2. repoint ${toRepoint.length} retired-slug redirect(s):`);
if (!toRepoint.length) console.log('  · none — already current');
for (const r of toRepoint) console.log(`  ~ ${r.row.from_path}: ${r.row.to_path} → ${r.to}`);

console.log(`\n[unshadow-profile] 3. collapse ${toCollapse.length} two-hop chain(s):`);
if (!toCollapse.length) console.log('  · none — already single-hop');
for (const c of toCollapse) console.log(`  ~ ${c.row.from_path}: (via ${c.via}) → ${c.to}`);

if (!toDelete.length && !toRepoint.length && !toCollapse.length) {
  console.log('\n[unshadow-profile] Nothing to do.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[unshadow-profile] DRY RUN — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  await client.query('BEGIN');
  if (toDelete.length) {
    await client.query(`DELETE FROM redirects WHERE id = ANY($1::text[])`, [toDelete.map((r) => r.id)]);
  }
  for (const r of [...toRepoint, ...toCollapse]) {
    await client.query(`UPDATE redirects SET to_path = $1, updated_at = now() WHERE id = $2`, [
      r.to,
      r.row.id,
    ]);
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

console.log('\n[unshadow-profile] Applied. Done.');
console.log('[unshadow-profile] middleware caches redirects for 60s — allow a minute before re-checking.');
await pool.end();
