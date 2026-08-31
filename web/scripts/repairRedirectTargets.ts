/**
 * One-off, re-runnable repair of the `redirects` table: collapse every
 * multi-hop chain to a single hop, and stop every row that lands on a page
 * that no longer exists from doing so.
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
 *      owner deactivated «تسمه», «ورق استیل», «آجدار», «رنگی», «عرشه
 *      فولادی», «ورق کرکره», «ساندویچ پانل» and «ورق شیروانی», and
 *      re-activated «اسیدشویی» and «گالوانیزه» minutes later. That is
 *      deliberate curation, so this script does NOT re-activate anything — it
 *      only stops old URLs pointing at pages the owner chose to hide.
 *   3. **Retired SKUs.** 24 rows point at a `skus` row that is still in the
 *      table with `is_active = false` (e.g. `ibeam-ipe-1` «تیرآهن IPE ۲۰»).
 *      Its own sub-category page is live and is the right landing.
 *
 * ## What "live" means here
 *
 * Exactly what the public site serves 200 for, checked against catalog state
 * and spot-verified over HTTPS before this script was written:
 *
 *   /prices                     always live
 *   /prices/<cat>               `categories.is_active`
 *   /prices/<cat>/<sub>         …AND `sub_categories.is_active`
 *   /prices/<cat>/<sub>/<sku>   …AND `skus.is_active`
 *
 * `/prices/<cat>/factory/<f>` and `/prices/<cat>/size/<s>` are facet routes,
 * not sub-categories (`routes.ts`), so they are live whenever their category
 * is. No row currently uses one; the case is handled so a future one cannot
 * be mis-read as a dead sub-category and silently truncated.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one transaction; the full per-row report is printed before it
 *   · ABORTS rather than guessing if: a chain cycles, a chain is longer than
 *     MAX_HOPS, any row's `from_path` is itself a LIVE page (that is the PR
 *     #227 shadowing bug and wants a human), or a computed destination is
 *     itself a `from_path` (which would build a new chain)
 *   · never touches a row that already resolves in one hop to a live page
 *   · non-`/prices` rows (the seven /blog and /news ones) are reported and
 *     left alone — nothing about them is broken
 *   · idempotent: a second run recomputes from the database and reports
 *     nothing to do
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/repairRedirectTargets.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';

import { routes } from '../src/lib/routes';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[repair-redirects] DATABASE_URL is not set.');
  process.exit(1);
}

/** A chain longer than this is not something this script should reason about. */
const MAX_HOPS = 8;

/** Path segments that are routes in their own right, not sub-category slugs. */
const FACET_SEGMENTS = new Set(['factory', 'size']);

const pool = new pg.Pool({ connectionString: url, max: 1 });

const die = async (msg: string): Promise<never> => {
  console.error(`[repair-redirects] ${msg}`);
  await pool.end();
  process.exit(1);
};

// ── Catalog state ───────────────────────────────────────────────────────────
// Existence IS liveness now: the catalog has no hidden rows, so a row that
// is in the table serves a 200 and a row that is gone serves a 404.
const { rows: cats } = await pool.query<{ slug: string }>(`SELECT slug FROM categories`);
const catLive = new Set(cats.map((c) => c.slug));

const { rows: subs } = await pool.query<{ cat_slug: string; slug: string }>(
  `SELECT c.slug AS cat_slug, s.slug
     FROM sub_categories s JOIN categories c ON c.id = s.category_id`,
);
const subLive = new Set(subs.map((s) => `${s.cat_slug}/${s.slug}`));

const { rows: skuRows } = await pool.query<{ slug: string }>(`SELECT slug FROM skus`);
const skuLive = new Set(skuRows.map((s) => s.slug));

/**
 * Is this path a page the public site serves 200 for? Only `/prices` paths
 * are decidable from catalog state; `null` means "not this script's business"
 * and the row is left alone rather than guessed at.
 */
function isLive(path: string): boolean | null {
  if (path === routes.prices()) return true;
  if (!path.startsWith('/prices/')) return null;
  const seg = path.split('/').filter(Boolean); // ['prices', cat, …]
  const [, cat, sub, sku] = seg;
  if (!cat || seg.length > 4) return null;
  if (!catLive.has(cat)) return false;
  if (sub === undefined) return true;
  if (FACET_SEGMENTS.has(sub)) return true; // /prices/<cat>/factory/<f>
  if (!subLive.has(`${cat}/${sub}`)) return false;
  if (sku === undefined) return true;
  return skuLive.has(sku);
}

/** Nearest ancestor of `path` that is live; `/prices` is the floor. */
function nearestLiveAncestor(path: string): string {
  const seg = path.split('/').filter(Boolean);
  for (let n = seg.length - 1; n >= 1; n--) {
    const candidate = `/${seg.slice(0, n).join('/')}`;
    if (isLive(candidate) === true) return candidate;
  }
  return routes.prices();
}

// ── Redirect state ──────────────────────────────────────────────────────────
type RedirectRow = { id: string; from_path: string; to_path: string };
const { rows: allRedirects } = await pool.query<RedirectRow>(
  `SELECT id, from_path, to_path FROM redirects ORDER BY from_path`,
);
const byFrom = new Map(allRedirects.map((r) => [r.from_path, r]));

/**
 * A redirect whose `from_path` is itself a live page is shadowing that page —
 * middleware answers the redirect before the route ever matches. PR #227 had
 * to unpick three of these by hand; if one has reappeared it needs the same
 * human judgement about which side is canonical, so stop here.
 */
const shadowing = allRedirects.filter((r) => isLive(r.from_path) === true);
if (shadowing.length) {
  await die(
    `${shadowing.length} redirect(s) shadow a LIVE page — that is PR #227's bug class and ` +
      `needs a human decision about which side is canonical, not a mechanical repair. Aborting:\n` +
      shadowing.map((r) => `    ${r.from_path} → ${r.to_path}`).join('\n'),
  );
}

/** Follow `to_path` while it is itself a `from_path`. Returns the terminal. */
async function resolveChain(row: RedirectRow): Promise<{ terminal: string; via: string[] }> {
  const via: string[] = [];
  const seen = new Set([row.from_path]);
  let at = row.to_path;
  for (let i = 0; i < MAX_HOPS; i++) {
    if (seen.has(at)) {
      await die(`redirect cycle at ${row.from_path} (revisits ${at}) — aborting.`);
    }
    const next = byFrom.get(at);
    if (!next) return { terminal: at, via };
    seen.add(at);
    via.push(at);
    at = next.to_path;
  }
  return die(`chain from ${row.from_path} is longer than ${MAX_HOPS} hops — aborting.`);
}

// ── Plan ────────────────────────────────────────────────────────────────────
type Change = {
  row: RedirectRow;
  to: string;
  via: string[];
  /** The resolved terminal, when it was itself a dead page. */
  terminalDead: string | null;
};
const changes: Change[] = [];
const untouched: RedirectRow[] = [];

for (const row of allRedirects) {
  if (isLive(row.to_path) === null && !byFrom.has(row.to_path)) {
    untouched.push(row); // /blog, /news — single hop, nothing to decide
    continue;
  }
  const { terminal, via } = await resolveChain(row);
  const live = isLive(terminal);
  if (live === null) {
    // A chain that ends outside /prices. One hop is still better than two.
    if (via.length) changes.push({ row, to: terminal, via, terminalDead: null });
    else untouched.push(row);
    continue;
  }
  const to = live ? terminal : nearestLiveAncestor(terminal);
  if (to === row.to_path) continue; // already correct — idempotent
  if (isLive(to) !== true) {
    await die(`computed destination ${to} for ${row.from_path} is not live — aborting.`);
  }
  if (byFrom.has(to)) {
    await die(`computed destination ${to} for ${row.from_path} is itself redirected — aborting.`);
  }
  changes.push({ row, to, via, terminalDead: live ? null : terminal });
}

// ── Report ──────────────────────────────────────────────────────────────────
const collapsed = changes.filter((c) => c.via.length);
const reaimed = changes.filter((c) => c.terminalDead);

console.log(`\n[repair-redirects] ${allRedirects.length} redirect(s) in the table.`);
console.log(
  `[repair-redirects] ${untouched.length} left alone (single hop, destination outside /prices).`,
);
console.log(`\n[repair-redirects] 1. collapse ${collapsed.length} multi-hop chain(s):`);
if (!collapsed.length) console.log('  · none — every row is already a single hop');
for (const c of collapsed) console.log(`  ~ ${c.row.from_path}: (via ${c.via.join(' → ')}) → ${c.to}`);

console.log(`\n[repair-redirects] 2. re-aim ${reaimed.length} row(s) that land on a 404:`);
if (!reaimed.length) console.log('  · none — every destination is a live page');
for (const c of reaimed) console.log(`  ~ ${c.row.from_path}: ${c.terminalDead} (404) → ${c.to}`);

console.log(`\n[repair-redirects] ${changes.length} row(s) to update in total.`);
if (!changes.length) {
  console.log('[repair-redirects] Nothing to do.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[repair-redirects] DRY RUN — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of changes) {
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

console.log(`\n[repair-redirects] Applied ${changes.length} update(s).`);
console.log('[repair-redirects] middleware caches redirects for 60s — allow a minute before re-checking.');
await pool.end();
