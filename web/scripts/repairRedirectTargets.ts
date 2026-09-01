/**
 * Re-runnable repair of the `redirects` table: collapse every multi-hop chain
 * to a single hop, and stop every row that lands on a page that no longer
 * exists from doing so.
 *
 * The decisions live in `scripts/lib/redirectRepair.ts` (pure, unit-tested);
 * this file is the database and the command line around them.
 *
 * ## The two symptoms, and why they are one problem
 *
 * A production audit of the live table (1405/06/01) found:
 *
 *   · **22 two-hop chains.** `/prices/vrgh-grm` → `/prices/varagh-garm` →
 *     `/prices/sheet`. `middleware.ts` resolves ONE hop per request by
 *     design, so the browser makes two round trips and a crawler spends two
 *     fetches of its budget on one URL. Same class as PR #227's پروفیل fix.
 *
 *   · **57 rows whose destination is a 404.** Every one verified by hand
 *     against the live site, e.g. `/prices/varagh-garm/tasme` → 308 →
 *     `/prices/sheet/strip` → 404.
 *
 * They are one problem because they overlap: eight of the 22 chains END at a
 * 404, so collapsing them alone would only have produced a tidier route to
 * nowhere. Both are fixed in a single pass — resolve the chain, then, only if
 * the terminal is dead, walk up to the nearest live ancestor.
 *
 * ## Why the destinations died (checked, not assumed)
 *
 * Three distinct, legitimate causes — none of them a fault in the redirect
 * rows themselves, which is why the fix is to re-aim them rather than to
 * resurrect what they point at:
 *
 *   1. **The ورق / استیل re-slug of 1405/05/13.** `varagh-garm`,
 *      `varagh-sard`, `varagh-steel` and `astyl` were folded into `sheet`
 *      and `steel`. The old→new rows were written; the intermediate
 *      categories were then deleted, leaving the first hop pointing at a row
 *      that itself points somewhere else.
 *   2. **The owner's ورق restructuring of 1405/05/30.** In one panel session
 *      (`audit_entries`, actor 01KWZ1SQ92H8ZBYNTG4SK1FE4Q, 22:28–22:36) the
 *      owner retired «تسمه», «ورق استیل», «آجدار», «رنگی», «عرشه فولادی»,
 *      «ورق کرکره», «ساندویچ پانل» and «ورق شیروانی», and brought
 *      «اسیدشویی» and «گالوانیزه» back minutes later. That is deliberate
 *      curation, so this script never resurrects anything — it only stops
 *      old URLs pointing at pages the owner chose to remove.
 *   3. **Retired SKUs.** 24 rows pointed at a product that is no longer in
 *      the catalog (e.g. `ibeam-ipe-1` «تیرآهن IPE ۲۰»). Its own
 *      sub-category page is live and is the right landing.
 *
 * ## Why this is now on a timer
 *
 * It was written as a one-off and registered in no cron, which is the wrong
 * shape for a problem that regenerates. `redirectsRepo.collapseAround` keeps
 * the table one hop deep only for rows written THROUGH THE PANEL — and rows
 * arrive by three other routes. A delete now writes a tombstone at every
 * level in one bulk statement that skips the backward collapse on purpose, so
 * each one lengthens any pre-existing row aimed at the deleted page into two
 * hops; the 41 scripts in this directory write rows directly; and a raw
 * `DELETE FROM` in a SQL migration (`0049`) removes pages without telling
 * anyone. See `ops/systemd/ahantime-redirect-repair.timer`.
 *
 * ## Modes
 *
 *   (default)  dry run — print the plan, write nothing, exit 0
 *   --check    dry run — exit 0 clean, 2 if there is drift, 1 if the table
 *              needs a human. For a monitor; decides nothing itself.
 *   --apply    write the plan, in one transaction
 *
 * It aborts (exit 1) rather than guessing if a chain cycles, a chain is
 * longer than `MAX_HOPS`, any row's `from_path` is itself a LIVE page, or a
 * computed destination is itself a `from_path`.
 *
 * Run (no node on the production host's PATH — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/repairRedirectTargets.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

import {
  RedirectRepairAbort,
  planRedirectRepairs,
  summarise,
  type CatalogState,
  type RedirectRow,
} from './lib/redirectRepair';

const APPLY = process.argv.includes('--apply');
const CHECK = process.argv.includes('--check');

/** 0 = nothing to do · 2 = drift found (--check only) · 1 = needs a human. */
const EXIT_CLEAN = 0;
const EXIT_NEEDS_HUMAN = 1;
const EXIT_DRIFT = 2;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[repair-redirects] DATABASE_URL is not set.');
  process.exit(EXIT_NEEDS_HUMAN);
}

if (APPLY && CHECK) {
  console.error('[repair-redirects] --check and --apply are mutually exclusive.');
  process.exit(EXIT_NEEDS_HUMAN);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

const die = async (msg: string): Promise<never> => {
  console.error(`[repair-redirects] ${msg}`);
  await pool.end();
  process.exit(EXIT_NEEDS_HUMAN);
};

// ── Snapshot ────────────────────────────────────────────────────────────────
// Existence IS liveness now: the catalog has no hidden rows, so a row that is
// in the table serves a 200 and a row that is gone serves a 404.
const { rows: cats } = await pool.query<{ slug: string }>(`SELECT slug FROM categories`);
const { rows: subs } = await pool.query<{ cat_slug: string; slug: string }>(
  `SELECT c.slug AS cat_slug, s.slug
     FROM sub_categories s JOIN categories c ON c.id = s.category_id`,
);
const { rows: skuRows } = await pool.query<{ slug: string }>(`SELECT slug FROM skus`);

const state: CatalogState = {
  categories: new Set(cats.map((c) => c.slug)),
  subCategories: new Set(subs.map((s) => `${s.cat_slug}/${s.slug}`)),
  skus: new Set(skuRows.map((s) => s.slug)),
};

const { rows: dbRedirects } = await pool.query<{ id: string; from_path: string; to_path: string }>(
  `SELECT id, from_path, to_path FROM redirects ORDER BY from_path`,
);
const allRedirects: RedirectRow[] = dbRedirects.map((r) => ({
  id: r.id,
  fromPath: r.from_path,
  toPath: r.to_path,
}));

// ── Plan ────────────────────────────────────────────────────────────────────
let plan;
try {
  plan = planRedirectRepairs(allRedirects, state);
} catch (err) {
  if (err instanceof RedirectRepairAbort) await die(`${err.message}\nAborting.`);
  throw err;
}

const { collapsed, reaimed } = summarise(plan);

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\n[repair-redirects] ${allRedirects.length} redirect(s) in the table.`);
console.log(
  `[repair-redirects] ${plan.untouched.length} left alone (single hop, destination outside /prices).`,
);
console.log(`\n[repair-redirects] 1. collapse ${collapsed.length} multi-hop chain(s):`);
if (!collapsed.length) console.log('  · none — every row is already a single hop');
for (const c of collapsed) {
  console.log(`  ~ ${c.row.fromPath}: (via ${c.via.join(' → ')}) → ${c.to}`);
}

console.log(`\n[repair-redirects] 2. re-aim ${reaimed.length} row(s) that land on a 404:`);
if (!reaimed.length) console.log('  · none — every destination is a live page');
for (const c of reaimed) {
  console.log(`  ~ ${c.row.fromPath}: ${c.terminalDead} (404) → ${c.to}`);
}

// Every re-aim lands on a living ANCESTOR, never on the product the old URL
// was about — that choice is the owner's and this script will not make it.
// Printing the list is what puts it in the journal for a human to override;
// a row they re-point by hand then resolves in one hop and is never touched
// again (see `planRedirectRepairs`'s idempotence).
if (reaimed.length) {
  console.log(
    `\n[repair-redirects] NOTE: those ${reaimed.length} row(s) land on a living ANCESTOR, not ` +
      `on a replacement product. Re-point any of them in the panel and this script will ` +
      `leave your choice alone.`,
  );
}

console.log(`\n[repair-redirects] ${plan.changes.length} row(s) to update in total.`);

if (!plan.changes.length) {
  console.log('[repair-redirects] Nothing to do.');
  await pool.end();
  process.exit(EXIT_CLEAN);
}

if (CHECK) {
  console.log('\n[repair-redirects] CHECK — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(EXIT_DRIFT);
}

if (!APPLY) {
  console.log('\n[repair-redirects] DRY RUN — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(EXIT_CLEAN);
}

// ── Apply ───────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of plan.changes) {
    await client.query(`UPDATE redirects SET to_path = $1, updated_at = now() WHERE id = $2`, [
      c.to,
      c.row.id,
    ]);
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

console.log(`\n[repair-redirects] Applied ${plan.changes.length} update(s).`);
console.log(
  '[repair-redirects] middleware caches redirects for 60s — allow a minute before re-checking.',
);
await pool.end();
