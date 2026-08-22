/**
 * One-off, re-runnable repair: give «نبشی و ناودانی» back the four product
 * lines it actually stocks, and retire the empty rows that stood in for them.
 *
 * ## What happened
 *
 * `remapStrandedSubCategories.ts` found 119 active SKUs parked on deactivated
 * sub-categories and moved the unambiguous ones onto their live twin. Four
 * angle-channel rows were deliberately left alone, with the reasons recorded
 * in its `DELIBERATELY_UNMAPPED` list:
 *
 *   · `channel-light` (ناودانی سبک, 4 SKUs) and `channel-heavy` (ناودانی
 *     سنگین, 6 SKUs) — «two equally plausible twins … picking one is a
 *     product decision»
 *   · `angle-unequal` (نبشی بال نامساوی, 5 SKUs) — «its only candidate twin is
 *     `nabshi`, which `angle` has the stronger claim on»
 *   · `spot` (نبشی لقمه, 5 SKUs) — «no live sub-category corresponds to لقمه»
 *
 * That was the right call for a script that could only guess, and it left 20
 * active, priced SKUs from real Iranian mills (سپهر ایرانیان, ظهوریان مشهد,
 * دهشیر یزد, ناب تبریز, آریان فولاد, جاوید بناب, فایکو, شکفته مشهد) invisible
 * site-wide, because every public read filters `sub_categories.is_active`.
 *
 * Meanwhile the taxonomy import had added an ORIGIN split — `navdany-ayrany`
 * (ناودانی ایرانی) and `navdany-arvpayy` (ناودانی اروپایی) — active, and with
 * zero SKU rows between them. Those are the ناودانی links the mega-menu shows
 * today and both are dead ends: `navdany-arvpayy`'s own URL already carries a
 * 308 back to the category page from an earlier cleanup, and `navdany-ayrany`
 * is an empty page.
 *
 * ## The decision this script makes, and the evidence for it
 *
 * The WEIGHT-CLASS split (سبک/سنگین) is the one to keep:
 *
 *   · it is the only one with inventory — 10 priced ناودانی SKUs against 0;
 *   · it is the one the rest of the codebase already knows about.
 *     `catalogCompose.ts`'s `CATALOG_WEIGHT_BASIS` header discusses «ناودانی
 *     سبک / سنگین» as the real weight classes and records why neither gets a
 *     theoretical weight; `weight.ts` carries the same distinction;
 *   · an origin split is NOT this catalog's pattern. The only other one in the
 *     taxonomy is لوله مانیسمان داخلی/خارجی, which exists because the owner
 *     asked for it by name. No other product line splits by country, while
 *     ورق, میلگرد, پروفیل and تیرآهن all split by TYPE and weight class the
 *     way سبک/سنگین does;
 *   · a duplicate «ناودانی اروپایی» row (`navdani-oroupaei`) is already sitting
 *     deactivated beside it, so the origin split had been abandoned once
 *     already.
 *
 * So: reactivate the four real rows, retire the two empty ناودانی ones, and
 * cluster the seven live rows under «نبشی» and «ناودانی» headings so the
 * category reads as the two product lines its name promises.
 *
 * ## Also fixed here: ناودانی filed under ورق
 *
 * A THIRD `navdany-ayrany` row exists under the `sheet` (ورق) category —
 * active, empty, and rendering «ناودانی ایرانی» inside the ورق panel of the
 * mega-menu. A channel section is not a sheet product; that row is a
 * mis-parented import and is retired to `/prices/angle-channel`, which is
 * where the product genuinely lives.
 *
 * ## Un-hiding is not the same operation as hiding
 *
 * `cleanupEmptySubCategories.ts` established the soft-deactivate precedent
 * this follows in reverse, and reversing it needs one check hiding does not:
 * that nothing has since assumed these slugs were gone. No `redirects` row
 * points at or away from the four URLs — asserted at runtime below, and the
 * script ABORTS rather than publishing a URL the site already 308s elsewhere.
 * The other direction is asserted too: nothing is reactivated that holds no
 * active SKU, and nothing is retired that holds any SKU at all.
 *
 * ## Category description
 *
 * `seedCategoryDescriptions.ts` wrote «نبشی و ناودانی»'s line and noted in its
 * own header that the sentence deliberately does not claim ناودانی — «If
 * ناودانی is loaded later, the panel is where that sentence gets updated». It
 * is loaded now, so the authored copy in `categoryDescriptions.ts` names it,
 * and this script applies that one row. It replaces ONLY the exact previous
 * seed string: a description an admin has since edited is reported and left
 * alone, because the panel owns that text.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · nothing is deleted; `is_active = false` is this schema's delete
 *   · one transaction; the full report is printed before it
 *   · idempotent: a second run recomputes from the database and reports
 *     nothing to do
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/restoreChannelSubCategories.ts
 *   # …review the report, then re-run with --apply
 */
import pg from 'pg';
import { ulid } from 'ulid';

import { routes } from '../src/lib/routes';
import {
  ANGLE_CHANNEL_DESCRIPTION_BEFORE_CHANNEL,
  CATEGORY_DESCRIPTIONS,
} from './categoryDescriptions';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[restore-channel] DATABASE_URL is not set.');
  process.exit(1);
}

const CATEGORY = 'angle-channel';

/**
 * The seven live rows of «نبشی و ناودانی», in reading order, with the display
 * cluster each belongs to. `groupSubCategories` promotes a member whose NAME
 * is the group label into the group's heading LINK, so «نبشی» heads its own
 * two variants as a link, and «ناودانی» — which names no single row — heads
 * سبک/سنگین as a text label. سپری and وال پست stay their own sections.
 */
const LIVE_ORDER: ReadonlyArray<{ slug: string; group: string | null }> = [
  { slug: 'nabshi', group: 'نبشی' },
  { slug: 'angle-unequal', group: 'نبشی' },
  { slug: 'spot', group: 'نبشی' },
  { slug: 'channel-light', group: 'ناودانی' },
  { slug: 'channel-heavy', group: 'ناودانی' },
  { slug: 'separi', group: null },
  { slug: 'val-post', group: null },
];

/** Rows to reactivate. Each must hold at least one active SKU — asserted below. */
const REACTIVATE = ['angle-unequal', 'spot', 'channel-light', 'channel-heavy'] as const;

/**
 * Rows to retire, as `category/sub` → where their URL should 308 to. Each must
 * hold ZERO SKU rows — asserted below: this script never hides stock.
 */
const RETIRE: Readonly<Record<string, string>> = {
  'angle-channel/navdany-ayrany': routes.category(CATEGORY),
  'angle-channel/navdany-arvpayy': routes.category(CATEGORY),
  // ناودانی is not a sheet product — send it to the category that sells it.
  'sheet/navdany-ayrany': routes.category(CATEGORY),
};

const pool = new pg.Pool({ connectionString: url, max: 1 });

type SubRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  order: number;
  group_label: string | null;
  cat_slug: string;
  all_skus: number;
  active_skus: number;
};

const { rows: subs } = await pool.query<SubRow>(`
  SELECT s.id, s.slug, s.name, s.is_active, s."order", s.group_label, c.slug AS cat_slug,
         (SELECT count(*)::int FROM skus k WHERE k.sub_category_id = s.id) AS all_skus,
         (SELECT count(*)::int FROM skus k WHERE k.sub_category_id = s.id AND k.is_active) AS active_skus
    FROM sub_categories s JOIN categories c ON c.id = s.category_id
`);
const byKey = new Map(subs.map((s) => [`${s.cat_slug}/${s.slug}`, s]));
const key = (slug: string) => `${CATEGORY}/${slug}`;

const die = async (msg: string): Promise<never> => {
  console.error(`[restore-channel] ${msg}`);
  await pool.end();
  process.exit(1);
};

// ── Preconditions ───────────────────────────────────────────────────────────
const missing = [...LIVE_ORDER.map((r) => key(r.slug)), ...Object.keys(RETIRE)].filter(
  (k) => !byKey.has(k),
);
if (missing.length) {
  await die(`expected sub-categories are absent — aborting: ${missing.join(', ')}`);
}

const emptyReactivate = REACTIVATE.filter((s) => byKey.get(key(s))!.active_skus === 0);
if (emptyReactivate.length) {
  await die(
    `refusing to publish an empty sub-category: ${emptyReactivate.join(', ')} hold no active SKU — aborting.`,
  );
}
const stockedRetire = Object.keys(RETIRE).filter((k) => byKey.get(k)!.all_skus > 0);
if (stockedRetire.length) {
  await die(`refusing to hide stock: ${stockedRetire.join(', ')} hold SKU rows — aborting.`);
}

// Nothing may already treat a URL this run publishes as retired.
const reactivatePaths = REACTIVATE.map((s) => routes.subCategory(CATEGORY, s));
const { rows: clashes } = await pool.query<{ from_path: string; to_path: string }>(
  `SELECT from_path, to_path FROM redirects WHERE from_path = ANY($1::text[])`,
  [reactivatePaths],
);
if (clashes.length) {
  console.error('[restore-channel] a redirect already claims a URL this run publishes:');
  for (const c of clashes) console.error(`  ! ${c.from_path} → ${c.to_path}`);
  await die('aborting.');
}

// ── Plan ────────────────────────────────────────────────────────────────────
const activations = REACTIVATE.map((s) => byKey.get(key(s))!).filter((s) => !s.is_active);
const retirements = Object.keys(RETIRE)
  .map((k) => byKey.get(k)!)
  .filter((s) => s.is_active);
const ordering = LIVE_ORDER.map((r, i) => ({
  row: byKey.get(key(r.slug))!,
  order: i + 1,
  group: r.group,
})).filter((f) => f.row.order !== f.order || (f.row.group_label || null) !== f.group);

const wantedRedirects = Object.entries(RETIRE).map(([k, to]) => {
  const [cat, sub] = k.split('/');
  return { from: routes.subCategory(cat!, sub!), to };
});
const { rows: existingRedirects } = await pool.query<{ from_path: string }>(
  `SELECT from_path FROM redirects WHERE from_path = ANY($1::text[])`,
  [wantedRedirects.map((r) => r.from)],
);
const alreadyRedirected = new Set(existingRedirects.map((r) => r.from_path));
const redirectsToAdd = wantedRedirects.filter((r) => !alreadyRedirected.has(r.from));

const { rows: catRows } = await pool.query<{ id: string; seo: { description?: string } | null }>(
  `SELECT id, seo FROM categories WHERE slug = $1`,
  [CATEGORY],
);
const cat = catRows[0];
if (!cat) await die(`category "${CATEGORY}" not found — aborting.`);
const currentDescription = cat!.seo?.description ?? '';
const wantedDescription = CATEGORY_DESCRIPTIONS[CATEGORY]!;
const descriptionState =
  currentDescription === wantedDescription
    ? 'already-current'
    : currentDescription === '' || currentDescription === ANGLE_CHANNEL_DESCRIPTION_BEFORE_CHANNEL
      ? 'write'
      : 'admin-edited';

console.log(
  `\n[restore-channel] 1. reactivate ${activations.length} sub-category(ies) holding real stock:`,
);
if (!activations.length) console.log('  · none — already active');
for (const a of activations) {
  console.log(`  + ${a.cat_slug}/${a.slug}  "${a.name}"  ${a.active_skus} active sku(s)`);
}

console.log(`\n[restore-channel] 2. retire ${retirements.length} empty sub-category(ies):`);
if (!retirements.length) console.log('  · none — already inactive');
for (const r of retirements) {
  console.log(`  − ${r.cat_slug}/${r.slug}  "${r.name}"  → ${RETIRE[`${r.cat_slug}/${r.slug}`]}`);
}

console.log(`\n[restore-channel] 3. order + group for the live «نبشی و ناودانی» rows:`);
if (!ordering.length) console.log('  · none — already correct');
for (const o of ordering) {
  console.log(
    `  ~ ${o.row.slug}: order ${o.row.order} → ${o.order}, group ${o.row.group_label || '—'} → ${o.group ?? '—'}`,
  );
}

console.log(
  `\n[restore-channel] 4. ${redirectsToAdd.length} new redirect(s); ${alreadyRedirected.size} already present:`,
);
for (const r of redirectsToAdd) console.log(`  + ${r.from} → ${r.to}`);

console.log(`\n[restore-channel] 5. category description: ${descriptionState}`);
if (descriptionState === 'write') {
  console.log(`      «${currentDescription || '—'}»`);
  console.log(`  →   «${wantedDescription}»`);
} else if (descriptionState === 'admin-edited') {
  console.log(`      LEFT ALONE — the panel owns this text and it has been edited:`);
  console.log(`      «${currentDescription}»`);
}

const nothingToDo =
  !activations.length &&
  !retirements.length &&
  !ordering.length &&
  !redirectsToAdd.length &&
  descriptionState !== 'write';
if (nothingToDo) {
  console.log('\n[restore-channel] Nothing to do.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[restore-channel] DRY RUN — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  await client.query('BEGIN');
  if (activations.length) {
    await client.query(`UPDATE sub_categories SET is_active = true WHERE id = ANY($1::text[])`, [
      activations.map((a) => a.id),
    ]);
  }
  if (retirements.length) {
    await client.query(`UPDATE sub_categories SET is_active = false WHERE id = ANY($1::text[])`, [
      retirements.map((r) => r.id),
    ]);
  }
  for (const o of ordering) {
    await client.query(`UPDATE sub_categories SET "order" = $1, group_label = $2 WHERE id = $3`, [
      o.order,
      o.group,
      o.row.id,
    ]);
  }
  for (const r of redirectsToAdd) {
    await client.query(
      `INSERT INTO redirects (id, from_path, to_path, permanent) VALUES ($1, $2, $3, true)
       ON CONFLICT (from_path) DO NOTHING`,
      [ulid(), r.from, r.to],
    );
  }
  if (descriptionState === 'write') {
    // Merge into `seo`, never replace it — title/canonical/ogImage live there too.
    await client.query(
      `UPDATE categories
          SET seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object('description', $1::text),
              updated_at = now()
        WHERE id = $2`,
      [wantedDescription, cat!.id],
    );
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}

console.log('\n[restore-channel] Applied. Done.');
await pool.end();
